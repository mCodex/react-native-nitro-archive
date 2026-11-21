use std::io::{Read, Seek, SeekFrom};

use crate::ArchiveError;

const MAX_DIRECTORY_BYTES: u64 = 16 * 1024 * 1024;
const MAX_ENTRIES: u64 = 10_000;
const END_RECORD_BYTES: usize = 22;

pub(crate) struct Directory {
    pub start: u64,
    pub end: u64,
    pub entries: usize,
    pub comment: Option<String>,
}

pub(crate) fn inspect_footer(reader: &mut (impl Read + Seek)) -> Result<Directory, ArchiveError> {
    let length = reader.seek(SeekFrom::End(0))?;
    if length < END_RECORD_BYTES as u64 {
        return Err(ArchiveError::TruncatedArchive);
    }
    let tail_length = length.min((END_RECORD_BYTES + usize::from(u16::MAX)) as u64) as usize;
    let tail_start = length - tail_length as u64;
    let mut tail = vec![0; tail_length];
    read_at(reader, tail_start, &mut tail)?;
    let end = tail
        .windows(END_RECORD_BYTES)
        .enumerate()
        .rev()
        .find_map(|(offset, bytes)| {
            (bytes.starts_with(b"PK\x05\x06")
                && offset + END_RECORD_BYTES + usize::from(u16_at(bytes, 20)) == tail_length)
                .then_some(offset)
        })
        .ok_or(ArchiveError::InvalidArchive)?;
    let footer = &tail[end..];
    let footer_offset = tail_start + end as u64;
    let disk = u16_at(footer, 4);
    let directory_disk = u16_at(footer, 6);
    let disk_entries = u16_at(footer, 8);
    let entries = u16_at(footer, 10);
    let size = u32_at(footer, 12);
    let offset = u32_at(footer, 16);

    if !matches!(disk, 0 | u16::MAX) || !matches!(directory_disk, 0 | u16::MAX) {
        return Err(ArchiveError::UnsupportedFormat);
    }

    let zip64 = read_zip64(reader, footer_offset)?;
    let (entries, size, start, directory_end) = if let Some((count, length, start, end)) = zip64 {
        if (entries != u16::MAX && u64::from(entries) != count)
            || (disk_entries != u16::MAX && u64::from(disk_entries) != count)
            || (size != u32::MAX && u64::from(size) != length)
            || (offset != u32::MAX && u64::from(offset) != start)
        {
            return Err(ArchiveError::InvalidArchive);
        }
        (count, length, start, end)
    } else {
        if disk != 0
            || directory_disk != 0
            || disk_entries != entries
            || entries == u16::MAX
            || size == u32::MAX
            || offset == u32::MAX
        {
            return Err(ArchiveError::InvalidArchive);
        }
        (
            u64::from(entries),
            u64::from(size),
            u64::from(offset),
            footer_offset,
        )
    };

    if entries > MAX_ENTRIES || size > MAX_DIRECTORY_BYTES {
        return Err(ArchiveError::ArchiveTooLarge);
    }
    if entries * 46 > size || start.checked_add(size) != Some(directory_end) {
        return Err(ArchiveError::InvalidArchive);
    }

    let comment = &footer[END_RECORD_BYTES..];
    Ok(Directory {
        start,
        end: directory_end,
        entries: entries as usize,
        comment: (!comment.is_empty()).then(|| String::from_utf8_lossy(comment).into_owned()),
    })
}

pub(crate) fn central_entry_end(
    reader: &mut (impl Read + Seek),
    start: u64,
    directory_end: u64,
) -> Result<u64, ArchiveError> {
    let fixed_end = start.checked_add(46).ok_or(ArchiveError::InvalidArchive)?;
    if fixed_end > directory_end {
        return Err(ArchiveError::InvalidArchive);
    }

    let mut lengths = [0; 6];
    read_at(reader, start + 28, &mut lengths)?;
    let variable_size = u64::from(u16_at(&lengths, 0))
        + u64::from(u16_at(&lengths, 2))
        + u64::from(u16_at(&lengths, 4));
    fixed_end
        .checked_add(variable_size)
        .filter(|end| *end <= directory_end)
        .ok_or(ArchiveError::InvalidArchive)
}

fn read_zip64(
    reader: &mut (impl Read + Seek),
    footer_offset: u64,
) -> Result<Option<(u64, u64, u64, u64)>, ArchiveError> {
    let Some(locator_offset) = footer_offset.checked_sub(20) else {
        return Ok(None);
    };
    let mut locator = [0; 20];
    read_at(reader, locator_offset, &mut locator)?;
    if !locator.starts_with(b"PK\x06\x07") {
        return Ok(None);
    }
    if u32_at(&locator, 4) != 0 || u32_at(&locator, 16) != 1 {
        return Err(ArchiveError::UnsupportedFormat);
    }

    let record_offset = u64_at(&locator, 8);
    if record_offset.checked_add(56) != Some(locator_offset) {
        return Err(ArchiveError::UnsupportedFormat);
    }
    let mut record = [0; 56];
    read_at(reader, record_offset, &mut record)?;
    if !record.starts_with(b"PK\x06\x06") || u64_at(&record, 4) != 44 {
        return Err(ArchiveError::InvalidArchive);
    }
    if u32_at(&record, 16) != 0 || u32_at(&record, 20) != 0 {
        return Err(ArchiveError::UnsupportedFormat);
    }
    let entries = u64_at(&record, 32);
    if u64_at(&record, 24) != entries {
        return Err(ArchiveError::InvalidArchive);
    }
    Ok(Some((
        entries,
        u64_at(&record, 40),
        u64_at(&record, 48),
        record_offset,
    )))
}

fn read_at(reader: &mut (impl Read + Seek), offset: u64, bytes: &mut [u8]) -> std::io::Result<()> {
    reader.seek(SeekFrom::Start(offset))?;
    reader.read_exact(bytes)
}

fn u16_at(bytes: &[u8], offset: usize) -> u16 {
    u16::from_le_bytes([bytes[offset], bytes[offset + 1]])
}

fn u32_at(bytes: &[u8], offset: usize) -> u32 {
    u32::from(u16_at(bytes, offset)) | (u32::from(u16_at(bytes, offset + 2)) << 16)
}

fn u64_at(bytes: &[u8], offset: usize) -> u64 {
    u64::from(u32_at(bytes, offset)) | (u64::from(u32_at(bytes, offset + 4)) << 32)
}
