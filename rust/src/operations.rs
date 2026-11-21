use std::collections::HashSet;
use std::fs::File;
use std::io::{Seek, Write};
use std::os::fd::{FromRawFd, RawFd};
use std::path::Path;
use std::sync::atomic::{AtomicUsize, Ordering};

use rustix::fs::{Mode, OFlags};
use serde::{Deserialize, Serialize};
use zip::unstable::write::FileOptionsExt;
use zip::write::SimpleFileOptions;
use zip::{AesMode, CompressionMethod, ZipWriter};

use crate::{ArchiveError, copy_entry, normalize_path, stream_entry_matching, tar_format};

const MAX_ENTRIES: usize = 10_000;
const MAX_CREATION_INPUT_BYTES: u64 = 16 << 30;
const MAX_CONCURRENT_OPERATIONS: usize = 4;
static ACTIVE_OPERATIONS: AtomicUsize = AtomicUsize::new(0);

#[derive(Deserialize)]
#[serde(
    tag = "operation",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub(crate) enum ArchiveOperation {
    Create {
        format: String,
        output_fd: RawFd,
        entries: Vec<CreationEntry>,
        compression_level: Option<u32>,
        store_already_compressed: Option<bool>,
        encryption_method: Option<String>,
    },
    Extract {
        archive_path: String,
        entry_path: String,
        output_fd: RawFd,
        limit: u64,
    },
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CreationEntry {
    pub path: String,
    pub kind: String,
    pub source_path: Option<String>,
    pub compression_method: Option<String>,
    pub modified_at: Option<f64>,
}

#[derive(Serialize)]
#[serde(untagged, rename_all_fields = "camelCase")]
pub(crate) enum OperationResult {
    Created {
        entry_count: usize,
        input_bytes: u64,
        output_bytes: u64,
    },
    Extracted {
        written_bytes: u64,
    },
}

pub(crate) fn run(
    operation: ArchiveOperation,
    password: &[u8],
    mut progress: impl FnMut(u64, u64) -> Result<(), ArchiveError>,
) -> Result<OperationResult, ArchiveError> {
    let _permit = OperationPermit::acquire()?;
    progress(0, 0)?;

    match operation {
        ArchiveOperation::Create {
            format,
            output_fd,
            mut entries,
            compression_level,
            store_already_compressed,
            encryption_method,
        } => {
            let level = compression_level.unwrap_or(6);
            if level > 9 {
                return Err(ArchiveError::InvalidArgument);
            }
            let encryption = encryption_method.as_deref().unwrap_or("none");
            if encryption != "none" {
                if format != "zip" || !matches!(encryption, "zip-crypto" | "aes-256") {
                    return Err(ArchiveError::UnsupportedEncryption);
                }
                if password.is_empty() {
                    return Err(ArchiveError::PasswordRequired);
                }
            }

            check_creation_entries(&mut entries)?;
            let mut output = open_staging_file(output_fd)?;
            let input_bytes = match format.as_str() {
                "zip" => write_zip(
                    &mut output,
                    &entries,
                    level,
                    store_already_compressed.unwrap_or(true),
                    encryption,
                    password,
                    &mut progress,
                )?,
                "tar" | "tar.gz" => tar_format::write_tar(
                    &mut output,
                    format == "tar.gz",
                    &entries,
                    level,
                    &mut progress,
                )?,
                _ => return Err(ArchiveError::UnsupportedFormat),
            };
            output.flush()?;
            Ok(OperationResult::Created {
                entry_count: entries.len(),
                input_bytes,
                output_bytes: output.metadata()?.len(),
            })
        }
        ArchiveOperation::Extract {
            archive_path,
            entry_path,
            output_fd,
            limit,
        } => {
            let mut output = open_staging_file(output_fd)?;
            let mut processed_bytes = 0u64;
            let password = (!password.is_empty()).then_some(password);
            let written_bytes = stream_entry_matching(
                open_source_file(&archive_path)?,
                limit,
                password,
                true,
                |_, entry| entry.path == entry_path || entry.raw_path == entry_path,
                |bytes| {
                    processed_bytes += bytes.len() as u64;
                    progress(processed_bytes, 0)?;
                    output.write_all(bytes)?;
                    Ok(())
                },
            )
            .map_err(|error| {
                if error == ArchiveError::BufferLimitExceeded {
                    ArchiveError::ExtractionLimitExceeded
                } else {
                    error
                }
            })?;
            progress(written_bytes, 1)?;
            output.flush()?;
            Ok(OperationResult::Extracted { written_bytes })
        }
    }
}

pub(crate) fn open_source_file(path: &str) -> Result<File, ArchiveError> {
    if !Path::new(path).is_absolute() || path.as_bytes().contains(&0) {
        return Err(ArchiveError::InvalidArgument);
    }
    let fd = rustix::fs::open(
        path,
        OFlags::RDONLY | OFlags::NOFOLLOW | OFlags::NONBLOCK | OFlags::CLOEXEC,
        Mode::empty(),
    );
    let file = File::from(fd.map_err(|error| {
        if error == rustix::io::Errno::LOOP {
            ArchiveError::UnsafeSymlink
        } else {
            ArchiveError::Io
        }
    })?);
    if !file.metadata()?.is_file() {
        return Err(ArchiveError::SpecialFile);
    }
    Ok(file)
}

fn open_staging_file(fd: RawFd) -> Result<File, ArchiveError> {
    // SAFETY: fcntl validates the supplied numeric descriptor and returns an
    // independent descriptor on success. It does not take ownership of the original.
    let duplicate = unsafe { libc::fcntl(fd, libc::F_DUPFD_CLOEXEC, 0) };
    if duplicate < 0 {
        return Err(ArchiveError::InvalidArgument);
    }
    // SAFETY: This call is the sole owner of the successful fcntl result.
    let mut file = unsafe { File::from_raw_fd(duplicate) };
    let metadata = file.metadata()?;
    if !metadata.is_file() || metadata.len() != 0 || file.stream_position()? != 0 {
        return Err(ArchiveError::InvalidArgument);
    }
    Ok(file)
}

fn check_creation_entries(entries: &mut [CreationEntry]) -> Result<(), ArchiveError> {
    if entries.len() > MAX_ENTRIES {
        return Err(ArchiveError::ArchiveTooLarge);
    }

    for entry in entries.iter_mut() {
        let path = normalize_path(&entry.path)?;
        entry.path = match entry.kind.as_str() {
            "directory" => format!("{}/", path.trim_end_matches('/')),
            "file" if !path.ends_with('/') && entry.source_path.is_some() => path,
            _ => return Err(ArchiveError::InvalidArgument),
        };
    }

    let mut outputs = HashSet::with_capacity(entries.len());
    let mut files = HashSet::with_capacity(entries.len());
    for entry in entries.iter() {
        let path = entry.path.trim_end_matches('/');
        if !outputs.insert(path) {
            return Err(ArchiveError::DuplicateEntry);
        }
        if entry.kind == "file" {
            files.insert(path);
        }
    }
    for path in outputs {
        if path
            .match_indices('/')
            .any(|(offset, _)| files.contains(&path[..offset]))
        {
            return Err(ArchiveError::DuplicateEntry);
        }
    }
    Ok(())
}

fn write_zip(
    output: &mut File,
    entries: &[CreationEntry],
    level: u32,
    store_compressed: bool,
    encryption: &str,
    password: &[u8],
    progress: &mut impl FnMut(u64, u64) -> Result<(), ArchiveError>,
) -> Result<u64, ArchiveError> {
    let mut archive = ZipWriter::new(output);
    let mut processed = 0u64;
    for (index, entry) in entries.iter().enumerate() {
        let options = SimpleFileOptions::default();
        let options = match entry.modified_at.and_then(zip_timestamp) {
            Some(timestamp) => options.last_modified_time(timestamp),
            None => options,
        };

        if entry.kind == "directory" {
            archive.add_directory(&entry.path, options.unix_permissions(0o700))?;
        } else {
            let mut file = open_source_file(
                entry
                    .source_path
                    .as_deref()
                    .ok_or(ArchiveError::InvalidArgument)?,
            )?;
            let size = file.metadata()?.len();
            if size > MAX_CREATION_INPUT_BYTES.saturating_sub(processed) {
                return Err(ArchiveError::ArchiveTooLarge);
            }
            let method = match entry.compression_method.as_deref() {
                Some("store") => CompressionMethod::Stored,
                Some("deflate") => CompressionMethod::Deflated,
                Some(_) => return Err(ArchiveError::UnsupportedCompression),
                None if store_compressed && already_compressed(&entry.path) => {
                    CompressionMethod::Stored
                }
                None => CompressionMethod::Deflated,
            };
            let options = options
                .compression_method(method)
                .unix_permissions(0o600)
                .large_file(size >= u64::from(u32::MAX) / 2);
            let options = if method == CompressionMethod::Deflated {
                options.compression_level(Some(i64::from(level)))
            } else {
                options
            };
            let options = match encryption {
                "zip-crypto" => options.with_deprecated_encryption(password)?,
                "aes-256" => options.with_aes_encryption_bytes(AesMode::Aes256, password),
                _ => options,
            };
            archive.start_file(&entry.path, options)?;
            copy_entry(&mut file, size, size, |bytes| {
                processed += bytes.len() as u64;
                progress(processed, index as u64)?;
                archive.write_all(bytes)?;
                Ok(())
            })?;
        }

        progress(processed, index as u64 + 1)?;
    }

    archive.finish()?;
    Ok(processed)
}

fn zip_timestamp(milliseconds: f64) -> Option<zip::DateTime> {
    if !milliseconds.is_finite() {
        return None;
    }
    let timestamp =
        time::OffsetDateTime::from_unix_timestamp((milliseconds / 1000.0) as i64).ok()?;
    zip::DateTime::from_date_and_time(
        u16::try_from(timestamp.year()).ok()?,
        timestamp.month() as u8,
        timestamp.day(),
        timestamp.hour(),
        timestamp.minute(),
        timestamp.second(),
    )
    .ok()
}

fn already_compressed(path: &str) -> bool {
    Path::new(path)
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| {
            matches!(
                value.to_ascii_lowercase().as_str(),
                "jpg"
                    | "jpeg"
                    | "png"
                    | "webp"
                    | "avif"
                    | "heic"
                    | "mp4"
                    | "mov"
                    | "m4v"
                    | "mp3"
                    | "aac"
                    | "m4a"
                    | "ogg"
                    | "zip"
                    | "gz"
                    | "zst"
            )
        })
}

struct OperationPermit;

impl OperationPermit {
    fn acquire() -> Result<Self, ArchiveError> {
        ACTIVE_OPERATIONS
            .try_update(Ordering::AcqRel, Ordering::Acquire, |active| {
                (active < MAX_CONCURRENT_OPERATIONS).then_some(active + 1)
            })
            .map(|_| Self)
            .map_err(|_| ArchiveError::InvalidState)
    }
}

impl Drop for OperationPermit {
    fn drop(&mut self) {
        ACTIVE_OPERATIONS.fetch_sub(1, Ordering::Release);
    }
}
