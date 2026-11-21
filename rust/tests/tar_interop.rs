use std::io::Cursor;

use nitro_archive_core::{ArchiveError, inspect, read_entry};

const GNU: &[u8] = include_bytes!("fixtures/gnu-long.tar");
const PAX_GZIP: &[u8] = include_bytes!("fixtures/pax.tar.gz");
const GNU_CONTENT: &[u8] = b"GNU long name content\n";
const PAX_CONTENT: &[u8] = b"PAX path and size content\n";

#[test]
fn reads_gnu_long_names_and_pax_paths_from_independent_archives() {
    let cases = [
        (
            GNU,
            "tar",
            format!("long-{}.txt", "a".repeat(117)),
            GNU_CONTENT,
        ),
        (
            PAX_GZIP,
            "tar.gz",
            "files/renamed.txt".to_owned(),
            PAX_CONTENT,
        ),
    ];
    for (archive, format, path, content) in cases {
        let inspection = inspect(Cursor::new(archive)).expect("CPython TAR opens");
        assert_eq!(inspection.format, format);
        assert_eq!(inspection.compressed_size, archive.len() as u64);
        assert_eq!(inspection.entries.len(), 2);
        assert_eq!(inspection.entries[0].path, path);
        assert_eq!(inspection.entries[0].crc32, None);
        assert_eq!(inspection.entries[1].kind, "directory");
        assert_eq!(
            read_entry(Cursor::new(archive), 0, content.len() as u64, None).unwrap(),
            content
        );
        assert_eq!(
            read_entry(Cursor::new(archive), 0, content.len() as u64 - 1, None).unwrap_err(),
            ArchiveError::BufferLimitExceeded
        );
    }
}

#[test]
fn requires_tar_checksum_end_records_and_gzip_integrity() {
    let mut corrupt_header = GNU.to_vec();
    corrupt_header[0] ^= 1;
    assert_eq!(
        inspect(Cursor::new(corrupt_header)).unwrap_err(),
        ArchiveError::ChecksumMismatch
    );
    assert_eq!(
        inspect(Cursor::new(&GNU[..GNU.len() - 512])).unwrap_err(),
        ArchiveError::TruncatedArchive
    );

    let mut corrupt_padding = GNU.to_vec();
    let payload = GNU
        .windows(GNU_CONTENT.len())
        .position(|bytes| bytes == GNU_CONTENT)
        .expect("fixture contains the regular file payload");
    corrupt_padding[payload + GNU_CONTENT.len()] = 1;
    assert_eq!(
        read_entry(Cursor::new(corrupt_padding), 0, 64, None).unwrap_err(),
        ArchiveError::InvalidArchive
    );

    let mut corrupt_trailer = PAX_GZIP.to_vec();
    corrupt_trailer[PAX_GZIP.len() - 8] ^= 1;
    assert_eq!(
        read_entry(Cursor::new(corrupt_trailer), 0, 64, None).unwrap_err(),
        ArchiveError::ChecksumMismatch
    );

    let concatenated = [PAX_GZIP, PAX_GZIP].concat();
    assert_eq!(
        inspect(Cursor::new(concatenated)).unwrap_err(),
        ArchiveError::InvalidArchive
    );

    let trailing_garbage = [PAX_GZIP, b"trailing data"].concat();
    assert_eq!(
        inspect(Cursor::new(trailing_garbage)).unwrap_err(),
        ArchiveError::InvalidArchive
    );
}
