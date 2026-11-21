mod ffi;
mod footer;
mod operations;
mod tar_format;

use serde::Serialize;
use std::cell::RefCell;
use std::collections::HashSet;
use std::fmt;
use std::io::{self, Read, Seek, SeekFrom};
use zip::read::{ArchiveOffset, Config, ZipFileEntry};
use zip::result::ZipError;
use zip::unstable::read::ZipIterable;
use zip::{HasZipMetadata, ZipReadOptions};

const MAX_PATH_BYTES: usize = 1024;
const MAX_PATH_DEPTH: usize = 32;
const MAX_READ_BYTES: u64 = 512 * 1024 * 1024;

#[derive(Debug, PartialEq, Eq)]
pub enum ArchiveError {
    InvalidArgument,
    InvalidArchive,
    UnsupportedFormat,
    UnsupportedCompression,
    UnsupportedEncryption,
    UnsafeSymlink,
    SpecialFile,
    ExtractionLimitExceeded,
    OperationCancelled,
    InvalidState,
    PasswordRequired,
    BadPassword,
    EntryNotFound,
    ChecksumMismatch,
    TruncatedArchive,
    PathTraversal,
    AbsolutePath,
    DuplicateEntry,
    ArchiveTooLarge,
    BufferLimitExceeded,
    Io,
}

impl ArchiveError {
    pub const fn code(&self) -> &'static str {
        match self {
            Self::InvalidArgument => "E_INVALID_ARGUMENT",
            Self::InvalidArchive => "E_INVALID_ARCHIVE",
            Self::UnsupportedFormat => "E_UNSUPPORTED_FORMAT",
            Self::UnsupportedCompression => "E_UNSUPPORTED_COMPRESSION",
            Self::UnsupportedEncryption => "E_UNSUPPORTED_ENCRYPTION",
            Self::UnsafeSymlink => "E_UNSAFE_SYMLINK",
            Self::SpecialFile => "E_SPECIAL_FILE",
            Self::ExtractionLimitExceeded => "E_EXTRACTION_LIMIT_EXCEEDED",
            Self::OperationCancelled => "E_OPERATION_CANCELLED",
            Self::InvalidState => "E_INVALID_STATE",
            Self::PasswordRequired => "E_PASSWORD_REQUIRED",
            Self::BadPassword => "E_BAD_PASSWORD",
            Self::EntryNotFound => "E_ENTRY_NOT_FOUND",
            Self::ChecksumMismatch => "E_CHECKSUM_MISMATCH",
            Self::TruncatedArchive => "E_TRUNCATED_ARCHIVE",
            Self::PathTraversal => "E_PATH_TRAVERSAL",
            Self::AbsolutePath => "E_ABSOLUTE_PATH",
            Self::DuplicateEntry => "E_DUPLICATE_ENTRY",
            Self::ArchiveTooLarge => "E_ARCHIVE_TOO_LARGE",
            Self::BufferLimitExceeded => "E_BUFFER_LIMIT_EXCEEDED",
            Self::Io => "E_IO",
        }
    }
}

impl fmt::Display for ArchiveError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.code())
    }
}

impl std::error::Error for ArchiveError {}

impl From<io::Error> for ArchiveError {
    fn from(error: io::Error) -> Self {
        match error.kind() {
            io::ErrorKind::UnexpectedEof => Self::TruncatedArchive,
            io::ErrorKind::InvalidData => Self::InvalidArchive,
            _ => Self::Io,
        }
    }
}

impl From<ZipError> for ArchiveError {
    fn from(error: ZipError) -> Self {
        match error {
            ZipError::Io(error) => error.into(),
            ZipError::FileNotFound => Self::EntryNotFound,
            ZipError::InvalidPassword => Self::BadPassword,
            ZipError::CompressionMethodNotSupported(_) => Self::UnsupportedCompression,
            ZipError::UnsupportedArchive(_) => Self::UnsupportedFormat,
            _ => Self::InvalidArchive,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub path: String,
    pub raw_path: String,
    pub kind: &'static str,
    pub compressed_size: u64,
    pub uncompressed_size: u64,
    pub encrypted: bool,
    pub compression_method: &'static str,
    pub crc32: Option<u32>,
    pub unix_mode: Option<u16>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Inspection {
    pub format: &'static str,
    pub entries: Vec<Entry>,
    pub compressed_size: u64,
    pub total_uncompressed_size: u64,
    pub encrypted: bool,
    pub comment: Option<String>,
}

/// Index a supported archive and verify its structural metadata.
pub fn inspect(mut reader: impl Read + Seek) -> Result<Inspection, ArchiveError> {
    let format = format_hint(&mut reader)?;
    if format != "zip" {
        return tar_format::scan(reader, format, |_, _| Ok(()), || Ok(()));
    }

    let directory = footer::inspect_footer(&mut reader)?;
    let mut archive = open_zip(&mut reader, &directory)?;
    let (inspection, _) = inspect_entries(&mut archive, directory, |_, _| false)?;
    Ok(inspection)
}

fn format_hint(reader: &mut (impl Read + Seek)) -> Result<&'static str, ArchiveError> {
    let mut header = Vec::with_capacity(512);
    reader.seek(SeekFrom::Start(0))?;
    reader.take(512).read_to_end(&mut header)?;
    reader.seek(SeekFrom::Start(0))?;
    if header.starts_with(&[0x1f, 0x8b]) {
        return Ok("tar.gz");
    }
    if header.len() == 512
        && (header[257..].starts_with(b"ustar") || header.iter().all(|byte| *byte == 0))
    {
        return Ok("tar");
    }
    Ok("zip")
}

/// Verify and return one entry by archive index within a bounded buffer.
pub fn read_entry(
    reader: impl Read + Seek,
    index: usize,
    limit: u64,
    password: Option<&[u8]>,
) -> Result<Vec<u8>, ArchiveError> {
    read_entry_matching(reader, limit, password, |position, _| position == index)
}

fn read_entry_matching(
    reader: impl Read + Seek,
    limit: u64,
    password: Option<&[u8]>,
    matches: impl Fn(usize, &Entry) -> bool,
) -> Result<Vec<u8>, ArchiveError> {
    let limit = limit.min(MAX_READ_BYTES);
    let mut output = Vec::new();
    stream_entry_matching(reader, limit, password, false, matches, |bytes| {
        let needed = output.len() + bytes.len();
        if needed > output.capacity() {
            let capacity = output
                .capacity()
                .saturating_mul(2)
                .min(limit as usize)
                .max(needed);
            output
                .try_reserve_exact(capacity - output.len())
                .map_err(|_| ArchiveError::BufferLimitExceeded)?;
        }
        output.extend_from_slice(bytes);
        Ok(())
    })?;
    Ok(output)
}

fn stream_entry_matching(
    mut reader: impl Read + Seek,
    limit: u64,
    password: Option<&[u8]>,
    require_regular_file: bool,
    matches: impl Fn(usize, &Entry) -> bool,
    mut write: impl FnMut(&[u8]) -> Result<(), ArchiveError>,
) -> Result<u64, ArchiveError> {
    let format = format_hint(&mut reader)?;
    if format != "zip" {
        if password.is_some_and(|value| !value.is_empty()) {
            return Err(ArchiveError::UnsupportedEncryption);
        }
        let mut index = 0;
        let mut written = None;
        let write = RefCell::new(&mut write);
        tar_format::scan(
            reader,
            format,
            |entry, body| {
                if matches(index, entry) {
                    if require_regular_file {
                        check_file_kind(entry.kind)?;
                    }
                    written = Some(copy_entry(body, entry.uncompressed_size, limit, |bytes| {
                        write.borrow_mut()(bytes)
                    })?);
                }
                index += 1;
                Ok(())
            },
            || write.borrow_mut()(&[]),
        )?;
        return written.ok_or(ArchiveError::EntryNotFound);
    }

    let directory = footer::inspect_footer(&mut reader)?;
    let mut archive = open_zip(&mut reader, &directory)?;
    let (_, selected) = inspect_entries(&mut archive, directory, matches)?;
    let entry = selected.ok_or(ArchiveError::EntryNotFound)?;
    if require_regular_file {
        check_file_kind(inspect_entry(&entry)?.kind)?;
    }
    let expected_size = entry.size();
    if expected_size > limit {
        return Err(ArchiveError::BufferLimitExceeded);
    }
    if entry.encrypted() && password.is_none_or(<[u8]>::is_empty) {
        return Err(ArchiveError::PasswordRequired);
    }
    if !matches!(
        entry.compression(),
        zip::CompressionMethod::Stored | zip::CompressionMethod::Deflated
    ) {
        return Err(ArchiveError::UnsupportedCompression);
    }

    let options = ZipReadOptions::new().password(password);
    let files = archive.files()?;
    let mut file = entry.with_reader(files.reader_mut(), options)?;
    copy_entry(&mut file, expected_size, limit, write)
}

fn check_file_kind(kind: &str) -> Result<(), ArchiveError> {
    match kind {
        "file" => Ok(()),
        "symlink" => Err(ArchiveError::UnsafeSymlink),
        _ => Err(ArchiveError::SpecialFile),
    }
}

fn copy_entry(
    source: &mut (impl Read + ?Sized),
    expected_size: u64,
    limit: u64,
    mut write: impl FnMut(&[u8]) -> Result<(), ArchiveError>,
) -> Result<u64, ArchiveError> {
    if expected_size > limit {
        return Err(ArchiveError::BufferLimitExceeded);
    }
    let mut processed = 0u64;
    let mut chunk = [0; 32 * 1024];
    loop {
        let count = match source.read(&mut chunk) {
            Ok(0) => break,
            Ok(count) => count,
            Err(error) if error.kind() == io::ErrorKind::Interrupted => continue,
            Err(error) if error.kind() == io::ErrorKind::InvalidData => {
                return Err(ArchiveError::ChecksumMismatch);
            }
            Err(error) => return Err(error.into()),
        };
        processed = processed
            .checked_add(count as u64)
            .ok_or(ArchiveError::BufferLimitExceeded)?;
        if processed > limit {
            return Err(ArchiveError::BufferLimitExceeded);
        }
        write(&chunk[..count])?;
    }
    if processed != expected_size {
        return Err(ArchiveError::TruncatedArchive);
    }
    Ok(processed)
}

fn open_zip<R: Read + Seek>(
    reader: R,
    directory: &footer::Directory,
) -> Result<ZipIterable<R>, ArchiveError> {
    let config = Config {
        archive_offset: ArchiveOffset::Known(0),
    };
    let archive = ZipIterable::try_new(reader, config)?.enforce_header_consistency(true);
    if archive.len() != directory.entries {
        return Err(ArchiveError::InvalidArchive);
    }
    Ok(archive)
}

fn inspect_entries(
    archive: &mut ZipIterable<impl Read + Seek>,
    directory: footer::Directory,
    select: impl Fn(usize, &Entry) -> bool,
) -> Result<(Inspection, Option<ZipFileEntry<'static>>), ArchiveError> {
    let mut entries = Vec::with_capacity(directory.entries);
    let mut ranges = Vec::with_capacity(directory.entries);
    let mut compressed_size = 0u64;
    let mut total_uncompressed_size = 0u64;
    let mut encrypted = false;
    let mut selected = None;
    let mut next_central_header = directory.start;
    let files = archive.files()?;

    while let Some(item) = files.next() {
        let file = item?;
        if file.central_header_start() != next_central_header {
            return Err(ArchiveError::InvalidArchive);
        }
        let reader = files.reader_mut();
        next_central_header =
            footer::central_entry_end(reader, next_central_header, directory.end)?;
        let body_start = file.get_metadata().data_start(reader)?;
        let end = body_start
            .checked_add(file.compressed_size())
            .ok_or(ArchiveError::InvalidArchive)?;
        if end > directory.start {
            return Err(ArchiveError::InvalidArchive);
        }
        ranges.push((file.header_start(), end));

        let entry = inspect_entry(&file)?;
        if select(entries.len(), &entry) {
            selected = Some(file);
        }
        compressed_size = compressed_size
            .checked_add(entry.compressed_size)
            .ok_or(ArchiveError::ArchiveTooLarge)?;
        total_uncompressed_size = total_uncompressed_size
            .checked_add(entry.uncompressed_size)
            .ok_or(ArchiveError::ArchiveTooLarge)?;
        encrypted |= entry.encrypted;
        entries.push(entry);
    }

    ranges.sort_unstable();
    if next_central_header != directory.end || ranges.windows(2).any(|pair| pair[0].1 > pair[1].0) {
        return Err(ArchiveError::InvalidArchive);
    }
    let mut paths = HashSet::with_capacity(entries.len());
    if entries
        .iter()
        .any(|entry| !paths.insert(entry.path.trim_end_matches('/')))
    {
        return Err(ArchiveError::DuplicateEntry);
    }

    Ok((
        Inspection {
            format: "zip",
            entries,
            compressed_size,
            total_uncompressed_size,
            encrypted,
            comment: directory.comment,
        },
        selected,
    ))
}

fn inspect_entry(file: &ZipFileEntry<'_>) -> Result<Entry, ArchiveError> {
    let raw_path = file.name()?.into_owned();
    let path = normalize_path(&raw_path)?;
    let unix_mode = file.unix_mode().and_then(|mode| u16::try_from(mode).ok());
    let kind = if file.is_symlink() {
        "symlink"
    } else if file.is_dir() {
        "directory"
    } else {
        match unix_mode.unwrap_or(0) & 0o170000 {
            0 | 0o100000 => "file",
            _ => "special",
        }
    };
    #[allow(deprecated)]
    let method = file.compression().to_u16();
    let compression_method = match method {
        0 => "store",
        8 => "deflate",
        12 => "bzip2",
        14 => "lzma",
        93 => "zstd",
        _ => "unknown",
    };
    Ok(Entry {
        path,
        raw_path,
        kind,
        compressed_size: file.compressed_size(),
        uncompressed_size: file.size(),
        encrypted: file.encrypted(),
        compression_method,
        crc32: Some(file.crc32()),
        unix_mode,
    })
}

fn normalize_path(raw_path: &str) -> Result<String, ArchiveError> {
    if raw_path.len() > MAX_PATH_BYTES {
        return Err(ArchiveError::ArchiveTooLarge);
    }
    if raw_path.contains('\0') {
        return Err(ArchiveError::InvalidArgument);
    }

    let path = raw_path.replace('\\', "/");
    let drive_prefix =
        matches!(path.as_bytes(), [letter, b':', ..] if letter.is_ascii_alphabetic());
    if path.starts_with('/') || drive_prefix || path.contains("://") {
        return Err(ArchiveError::AbsolutePath);
    }

    let mut result = String::with_capacity(path.len());
    let mut depth = 0;
    for component in path.split('/').filter(|part| !matches!(*part, "" | ".")) {
        if component == ".." {
            return Err(ArchiveError::PathTraversal);
        }
        depth += 1;
        if depth > MAX_PATH_DEPTH {
            return Err(ArchiveError::ArchiveTooLarge);
        }
        if !result.is_empty() {
            result.push('/');
        }
        result.push_str(component);
    }
    if result.is_empty() {
        return Err(ArchiveError::InvalidArgument);
    }
    if raw_path.ends_with('/') {
        result.push('/');
    }
    Ok(result)
}
