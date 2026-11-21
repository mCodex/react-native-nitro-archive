use std::cell::RefCell;
use std::collections::HashSet;
use std::fs::File;
use std::io::{self, BufRead, BufReader, Read, Seek, Write};
use std::time::UNIX_EPOCH;

use flate2::{Compression, bufread::GzDecoder, write::GzEncoder};
use tar::{Builder, EntryType, Header};

use crate::operations::{CreationEntry, open_source_file};
use crate::{ArchiveError, Entry, Inspection, normalize_path};

const BLOCK_BYTES: usize = 512;
const MAX_ENTRIES: usize = 10_000;
const MAX_HEADER_COUNT: usize = 3 * MAX_ENTRIES;
const MAX_EXPANDED_BYTES: u64 = 2 * 1024 * 1024 * 1024;
const MAX_GZIP_RATIO: u64 = 1_000;
const MAX_EXTENSION_BYTES: usize = 16 * 1024;
const MAX_METADATA_BYTES: usize = 16 * 1024 * 1024;
const READ_CHUNK_BYTES: usize = 16 * 1024;

pub(crate) fn scan(
    reader: impl Read,
    format: &str,
    visit: impl FnMut(&Entry, &mut dyn Read) -> Result<(), ArchiveError>,
    mut checkpoint: impl FnMut() -> Result<(), ArchiveError>,
) -> Result<Inspection, ArchiveError> {
    if format == "tar" {
        return scan_with_checkpoint(reader, "tar", visit, checkpoint);
    }
    if format != "tar.gz" {
        return Err(ArchiveError::UnsupportedFormat);
    }

    checkpoint()?;
    let checkpoint = RefCell::new(checkpoint);
    let check = || (checkpoint.borrow_mut())();
    let input = BufReader::new(CheckedReader::new(reader, check));
    let mut decoded = GzDecoder::new(input);
    let result = scan_with_checkpoint(&mut decoded, "tar.gz", visit, check);
    let mut input = decoded.into_inner();
    if let Some(error) = input.get_mut().error.take() {
        return Err(error);
    }
    let mut inspection = result?;

    check()?;
    let has_suffix = input.fill_buf().map(|bytes| !bytes.is_empty());
    if let Some(error) = input.get_mut().error.take() {
        return Err(error);
    }
    if has_suffix? {
        return Err(ArchiveError::InvalidArchive);
    }

    let compressed_size = input.get_ref().bytes;
    if inspection.compressed_size > compressed_size.saturating_mul(MAX_GZIP_RATIO) {
        return Err(ArchiveError::ExtractionLimitExceeded);
    }
    inspection.compressed_size = compressed_size;
    Ok(inspection)
}

fn scan_with_checkpoint(
    reader: impl Read,
    format: &'static str,
    visit: impl FnMut(&Entry, &mut dyn Read) -> Result<(), ArchiveError>,
    checkpoint: impl FnMut() -> Result<(), ArchiveError>,
) -> Result<Inspection, ArchiveError> {
    let mut reader = CheckedReader::new(reader, checkpoint);
    let inspection = scan_tar(&mut reader, format, visit);
    reader.error.map_or(inspection, Err)
}

struct CheckedReader<R, F> {
    reader: R,
    checkpoint: F,
    bytes: u64,
    error: Option<ArchiveError>,
}

impl<R, F> CheckedReader<R, F> {
    fn new(reader: R, checkpoint: F) -> Self {
        Self {
            reader,
            checkpoint,
            bytes: 0,
            error: None,
        }
    }

    fn fail(&mut self, error: ArchiveError) -> io::Error {
        self.error = Some(error);
        io::Error::other("archive input rejected")
    }
}

impl<R: Read, F: FnMut() -> Result<(), ArchiveError>> Read for CheckedReader<R, F> {
    fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
        if buffer.is_empty() {
            return Ok(0);
        }
        if let Err(error) = (self.checkpoint)() {
            return Err(self.fail(error));
        }
        let remaining = MAX_EXPANDED_BYTES - self.bytes;
        let requested = buffer.len().min(READ_CHUNK_BYTES) as u64;
        let count = self
            .reader
            .read(&mut buffer[..requested.min(remaining.max(1)) as usize])?;
        if count as u64 > remaining {
            return Err(self.fail(ArchiveError::ArchiveTooLarge));
        }
        self.bytes += count as u64;
        Ok(count)
    }
}

#[derive(Default)]
struct EntryExtensions {
    path: Option<String>,
    size: Option<u64>,
    link: bool,
    present: bool,
}

fn scan_tar(
    mut reader: impl Read,
    format: &'static str,
    mut visit: impl FnMut(&Entry, &mut dyn Read) -> Result<(), ArchiveError>,
) -> Result<Inspection, ArchiveError> {
    let mut header = Header::new_old();
    let mut entries = Vec::new();
    let mut paths = HashSet::new();
    let mut total_uncompressed_size = 0u64;
    let mut archive_bytes = 0u64;
    let mut metadata_bytes = 0usize;
    let mut header_count = 0usize;
    let mut extensions = EntryExtensions::default();

    loop {
        archive_bytes = add_expanded(archive_bytes, BLOCK_BYTES as u64)?;
        reader
            .read_exact(header.as_mut_bytes())
            .map_err(read_error)?;
        if header.as_bytes().iter().all(|byte| *byte == 0) {
            if extensions.present {
                return Err(ArchiveError::InvalidArchive);
            }
            archive_bytes = finish_tar(&mut reader, archive_bytes)?;
            break;
        }

        header_count += 1;
        if header_count > MAX_HEADER_COUNT {
            return Err(ArchiveError::ArchiveTooLarge);
        }
        verify_checksum(&header)?;

        let entry_type = header.entry_type();
        let declared_size = header_size(&header)?;
        if entry_type.is_gnu_sparse() {
            return Err(ArchiveError::UnsupportedFormat);
        }
        if entry_type.is_pax_local_extensions()
            || entry_type.is_pax_global_extensions()
            || entry_type.is_gnu_longname()
            || entry_type.is_gnu_longlink()
        {
            let size = usize::try_from(declared_size)
                .ok()
                .filter(|size| *size <= MAX_EXTENSION_BYTES)
                .ok_or(ArchiveError::ArchiveTooLarge)?;
            metadata_bytes = metadata_bytes
                .checked_add(size)
                .filter(|total| *total <= MAX_METADATA_BYTES)
                .ok_or(ArchiveError::ArchiveTooLarge)?;
            archive_bytes = add_expanded(archive_bytes, padded_size(declared_size)?)?;

            let mut body = vec![0; size];
            reader.read_exact(&mut body).map_err(read_error)?;
            read_padding(&mut reader, declared_size)?;

            if entry_type.is_gnu_longname() || entry_type.is_gnu_longlink() {
                let value = body
                    .strip_suffix(&[0])
                    .ok_or(ArchiveError::InvalidArchive)?;
                if value.contains(&0) || value.is_empty() {
                    return Err(ArchiveError::InvalidArchive);
                }
                if entry_type.is_gnu_longname() {
                    set_path(&mut extensions, value)?;
                } else {
                    set_link(&mut extensions)?;
                }
            } else {
                read_pax(
                    &body,
                    entry_type.is_pax_global_extensions(),
                    &mut extensions,
                )?;
            }
            if !entry_type.is_pax_global_extensions() {
                extensions.present = true;
            }
            continue;
        }

        let item = std::mem::take(&mut extensions);
        let size = item.size.unwrap_or(declared_size);
        let kind = entry_kind(entry_type);
        if (kind != "file" && size != 0)
            || (item.link && !entry_type.is_symlink() && !entry_type.is_hard_link())
        {
            return Err(ArchiveError::InvalidArchive);
        }
        archive_bytes = add_expanded(archive_bytes, padded_size(size)?)?;

        let raw_path = if let Some(path) = item.path {
            path
        } else {
            String::from_utf8(header.path_bytes().into_owned())
                .map_err(|_| ArchiveError::InvalidArchive)?
        };
        if kind == "directory" && matches!(raw_path.as_str(), "." | "./") {
            continue;
        }
        let path = normalize_path(&raw_path)?;
        if entries.len() == MAX_ENTRIES {
            return Err(ArchiveError::ArchiveTooLarge);
        }
        if !paths.insert(path.trim_end_matches('/').to_owned()) {
            return Err(ArchiveError::DuplicateEntry);
        }
        total_uncompressed_size = add_expanded(total_uncompressed_size, size)?;

        let entry = Entry {
            path,
            raw_path,
            kind,
            compressed_size: if format == "tar" { size } else { 0 },
            uncompressed_size: size,
            encrypted: false,
            compression_method: if format == "tar" { "store" } else { "deflate" },
            crc32: None,
            unix_mode: header.mode().ok().and_then(|mode| u16::try_from(mode).ok()),
        };

        let mut body = (&mut reader).take(size);
        visit(&entry, &mut body)?;
        io::copy(&mut body, &mut io::sink()).map_err(read_error)?;
        if body.limit() != 0 {
            return Err(ArchiveError::TruncatedArchive);
        }
        read_padding(&mut reader, size)?;
        entries.push(entry);
    }

    Ok(Inspection {
        format,
        entries,
        compressed_size: archive_bytes,
        total_uncompressed_size,
        encrypted: false,
        comment: None,
    })
}

fn entry_kind(entry_type: EntryType) -> &'static str {
    if entry_type.is_file() || entry_type.is_contiguous() {
        "file"
    } else if entry_type.is_dir() {
        "directory"
    } else if entry_type.is_symlink() {
        "symlink"
    } else {
        "special"
    }
}

fn verify_checksum(header: &Header) -> Result<(), ArchiveError> {
    let bytes = header.as_bytes();
    let checksum = bytes[..148]
        .iter()
        .chain(&bytes[156..])
        .map(|byte| u32::from(*byte))
        .sum::<u32>()
        + 8 * u32::from(b' ');
    if header.cksum().map_err(|_| ArchiveError::InvalidArchive)? != checksum {
        return Err(ArchiveError::ChecksumMismatch);
    }
    Ok(())
}

fn header_size(header: &Header) -> Result<u64, ArchiveError> {
    let field = &header.as_old().size;
    if field[0] & 0x80 != 0 && field[..4] != [0x80, 0, 0, 0] {
        return Err(ArchiveError::InvalidArchive);
    }
    header
        .entry_size()
        .map_err(|_| ArchiveError::InvalidArchive)
}

fn set_path(extensions: &mut EntryExtensions, value: &[u8]) -> Result<(), ArchiveError> {
    if extensions.path.is_some() || value.is_empty() || value.len() > crate::MAX_PATH_BYTES {
        return Err(ArchiveError::InvalidArchive);
    }
    let path = std::str::from_utf8(value).map_err(|_| ArchiveError::InvalidArchive)?;
    extensions.path = Some(path.to_owned());
    Ok(())
}

fn set_link(extensions: &mut EntryExtensions) -> Result<(), ArchiveError> {
    if extensions.link {
        return Err(ArchiveError::InvalidArchive);
    }
    extensions.link = true;
    Ok(())
}

fn read_pax(
    mut bytes: &[u8],
    global: bool,
    extensions: &mut EntryExtensions,
) -> Result<(), ArchiveError> {
    while !bytes.is_empty() {
        let space = bytes
            .iter()
            .position(|byte| *byte == b' ')
            .ok_or(ArchiveError::InvalidArchive)?;
        let length = std::str::from_utf8(&bytes[..space])
            .ok()
            .filter(|length| length.bytes().all(|byte| byte.is_ascii_digit()))
            .and_then(|length| length.parse::<usize>().ok())
            .ok_or(ArchiveError::InvalidArchive)?;
        let (record, rest) = bytes
            .split_at_checked(length)
            .ok_or(ArchiveError::InvalidArchive)?;
        let pair = record
            .strip_suffix(b"\n")
            .and_then(|line| line.get(space + 1..))
            .ok_or(ArchiveError::InvalidArchive)?;
        let equals = pair
            .iter()
            .position(|byte| *byte == b'=')
            .filter(|equals| *equals > 0)
            .ok_or(ArchiveError::InvalidArchive)?;
        let key = &pair[..equals];
        let value = &pair[equals + 1..];

        match key {
            b"path" if !global => set_path(extensions, value)?,
            b"linkpath" if !global => set_link(extensions)?,
            b"size" if !global && extensions.size.is_none() => {
                let size = std::str::from_utf8(value)
                    .ok()
                    .filter(|size| size.bytes().all(|byte| byte.is_ascii_digit()))
                    .and_then(|size| size.parse::<u64>().ok())
                    .ok_or(ArchiveError::InvalidArchive)?;
                extensions.size = Some(size);
            }
            b"path" | b"linkpath" | b"size" | b"SCHILY.realsize" | b"GNU.dumpdir" => {
                return Err(ArchiveError::UnsupportedFormat);
            }
            key if key.starts_with(b"GNU.sparse.")
                || (key == b"SCHILY.filetype" && value == b"sparse") =>
            {
                return Err(ArchiveError::UnsupportedFormat);
            }
            _ => {}
        }
        bytes = rest;
    }
    Ok(())
}

fn finish_tar(reader: &mut impl Read, mut archive_bytes: u64) -> Result<u64, ArchiveError> {
    let mut block = [0; BLOCK_BYTES];
    reader.read_exact(&mut block).map_err(read_error)?;
    archive_bytes = add_expanded(archive_bytes, BLOCK_BYTES as u64)?;
    if block.iter().any(|byte| *byte != 0) {
        return Err(ArchiveError::InvalidArchive);
    }
    loop {
        let first = match reader.read(&mut block[..1]) {
            Err(error) if error.kind() == io::ErrorKind::Interrupted => continue,
            result => result.map_err(read_error)?,
        };
        if first == 0 {
            return Ok(archive_bytes);
        }
        reader.read_exact(&mut block[1..]).map_err(read_error)?;
        archive_bytes = add_expanded(archive_bytes, BLOCK_BYTES as u64)?;
        if block.iter().any(|byte| *byte != 0) {
            return Err(ArchiveError::InvalidArchive);
        }
    }
}

fn padded_size(size: u64) -> Result<u64, ArchiveError> {
    size.checked_next_multiple_of(BLOCK_BYTES as u64)
        .ok_or(ArchiveError::ExtractionLimitExceeded)
}

fn read_padding(reader: &mut impl Read, size: u64) -> Result<(), ArchiveError> {
    let count = (padded_size(size)? - size) as usize;
    let mut padding = [0; BLOCK_BYTES];
    reader
        .read_exact(&mut padding[..count])
        .map_err(read_error)?;
    if padding[..count].iter().any(|byte| *byte != 0) {
        return Err(ArchiveError::InvalidArchive);
    }
    Ok(())
}

fn add_expanded(total: u64, size: u64) -> Result<u64, ArchiveError> {
    total
        .checked_add(size)
        .filter(|total| *total <= MAX_EXPANDED_BYTES)
        .ok_or(ArchiveError::ExtractionLimitExceeded)
}

fn read_error(error: io::Error) -> ArchiveError {
    if error.kind() == io::ErrorKind::InvalidInput {
        return ArchiveError::ChecksumMismatch;
    }
    error.into()
}

pub(crate) fn write_tar(
    output: &mut (impl Write + Seek),
    gzip: bool,
    entries: &[CreationEntry],
    level: u32,
    progress: &mut impl FnMut(u64, u64) -> Result<(), ArchiveError>,
) -> Result<u64, ArchiveError> {
    if gzip {
        let start = output.stream_position()?;
        let encoder = GzEncoder::new(output, Compression::new(level));
        let (encoder, bytes, expanded) = append_entries(encoder, "deflate", entries, progress)?;
        let compressed = encoder
            .finish()?
            .stream_position()?
            .checked_sub(start)
            .ok_or(ArchiveError::Io)?;
        if compressed > MAX_EXPANDED_BYTES || expanded > compressed.saturating_mul(MAX_GZIP_RATIO) {
            return Err(ArchiveError::ExtractionLimitExceeded);
        }
        Ok(bytes)
    } else {
        let (_, bytes, _) = append_entries(output, "store", entries, progress)?;
        Ok(bytes)
    }
}

fn append_entries<W: Write>(
    writer: W,
    method: &str,
    entries: &[CreationEntry],
    progress: &mut impl FnMut(u64, u64) -> Result<(), ArchiveError>,
) -> Result<(W, u64, u64), ArchiveError> {
    if entries.len() > MAX_ENTRIES {
        return Err(ArchiveError::ArchiveTooLarge);
    }
    let mut archive = Builder::new(writer);
    let mut total = 0u64;
    let mut planned_output = 2 * BLOCK_BYTES as u64;

    for (index, entry) in entries.iter().enumerate() {
        if entry
            .compression_method
            .as_deref()
            .is_some_and(|value| value != method)
        {
            return Err(ArchiveError::UnsupportedCompression);
        }
        let path = &entry.path;
        let mut header = Header::new_gnu();
        header.set_uid(0);
        header.set_gid(0);
        planned_output = add_expanded(planned_output, BLOCK_BYTES as u64)?;
        // GNU long-name metadata can add one header and one padded path body.
        if path.len() > 100 {
            planned_output = add_expanded(
                planned_output,
                BLOCK_BYTES as u64 + padded_size(path.len() as u64 + 1)?,
            )?;
        }
        match entry.kind.as_str() {
            "directory" => {
                header.set_entry_type(EntryType::Directory);
                header.set_mode(0o755);
                header.set_size(0);
                header.set_mtime(modified_seconds(entry.modified_at, None)?);
                archive.append_data(&mut header, path, io::empty())?;
            }
            "file" => {
                if path.ends_with('/') {
                    return Err(ArchiveError::InvalidArgument);
                }
                let file = open_source_file(
                    entry
                        .source_path
                        .as_deref()
                        .ok_or(ArchiveError::InvalidArgument)?,
                )?;
                let metadata = file.metadata()?;
                let size = metadata.len();
                planned_output = add_expanded(planned_output, padded_size(size)?)?;
                let completed_before = total;
                total = add_expanded(total, size)?;
                header.set_entry_type(EntryType::Regular);
                header.set_mode(0o644);
                header.set_size(size);
                header.set_mtime(modified_seconds(entry.modified_at, Some(&metadata))?);

                let mut body = ProgressReader {
                    reader: file.take(size),
                    completed_before,
                    size,
                    entries: index as u64,
                    progress,
                    error: None,
                };
                let written = archive.append_data(&mut header, path, &mut body);
                if let Some(error) = body.error {
                    return Err(error);
                }
                written?;
                if body.reader.limit() != 0 {
                    return Err(ArchiveError::TruncatedArchive);
                }
            }
            _ => return Err(ArchiveError::SpecialFile),
        }
        progress(total, index as u64 + 1)?;
    }
    Ok((archive.into_inner()?, total, planned_output))
}

fn modified_seconds(
    timestamp: Option<f64>,
    metadata: Option<&std::fs::Metadata>,
) -> Result<u64, ArchiveError> {
    if let Some(timestamp) = timestamp {
        if !timestamp.is_finite() || timestamp < 0.0 || timestamp / 1000.0 >= u64::MAX as f64 {
            return Err(ArchiveError::InvalidArgument);
        }
        return Ok((timestamp / 1000.0) as u64);
    }
    Ok(metadata
        .and_then(|metadata| metadata.modified().ok())
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |duration| duration.as_secs()))
}

struct ProgressReader<'a, F> {
    reader: io::Take<File>,
    completed_before: u64,
    size: u64,
    entries: u64,
    progress: &'a mut F,
    error: Option<ArchiveError>,
}

impl<F: FnMut(u64, u64) -> Result<(), ArchiveError>> Read for ProgressReader<'_, F> {
    fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
        let count = self.reader.read(buffer)?;
        if count > 0
            && let Err(error) = (self.progress)(
                self.completed_before + self.size - self.reader.limit(),
                self.entries,
            )
        {
            self.error = Some(error);
            return Err(io::Error::other("archive progress callback failed"));
        }
        Ok(count)
    }
}

#[cfg(test)]
mod tests;
