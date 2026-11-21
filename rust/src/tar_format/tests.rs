use std::io::Cursor;

use super::*;

const SOURCE: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/pax.tar.gz");
const PAX_GZIP: &[u8] = include_bytes!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/tests/fixtures/pax.tar.gz"
));

#[test]
fn writes_both_wrappers_and_reports_chunk_progress() {
    let path = format!("long-{}.txt", "a".repeat(110));
    let entry = CreationEntry {
        path: path.clone(),
        kind: "file".to_owned(),
        source_path: Some(SOURCE.to_owned()),
        compression_method: None,
        modified_at: Some(1_704_067_200_000.0),
    };

    for (gzip, format) in [(false, "tar"), (true, "tar.gz")] {
        let mut output = Cursor::new(Vec::new());
        let mut last_progress = (0, 0);
        let size = write_tar(
            &mut output,
            gzip,
            std::slice::from_ref(&entry),
            6,
            &mut |bytes, entries| {
                assert!(bytes >= last_progress.0 && entries >= last_progress.1);
                last_progress = (bytes, entries);
                Ok(())
            },
        )
        .unwrap();
        assert_eq!(size, PAX_GZIP.len() as u64);
        assert_eq!(last_progress, (size, 1));

        let inspection = scan(
            output.get_ref().as_slice(),
            format,
            |entry, body| {
                assert_eq!(entry.path, path);
                let mut actual = Vec::new();
                body.read_to_end(&mut actual)?;
                assert_eq!(actual, PAX_GZIP);
                Ok(())
            },
            || Ok(()),
        )
        .unwrap();
        assert_eq!(inspection.compressed_size, output.get_ref().len() as u64);
    }

    let error = write_tar(
        &mut Cursor::new(Vec::new()),
        true,
        &[entry],
        6,
        &mut |_, _| Err(ArchiveError::OperationCancelled),
    )
    .unwrap_err();
    assert_eq!(error, ArchiveError::OperationCancelled);
}

#[test]
fn stops_at_checkpoints_while_draining_entries() {
    let visited = std::cell::Cell::new(false);
    let scanned = scan(
        PAX_GZIP,
        "tar.gz",
        |_, _| {
            visited.set(true);
            Ok(())
        },
        || {
            if visited.get() {
                Err(ArchiveError::OperationCancelled)
            } else {
                Ok(())
            }
        },
    );
    assert_eq!(scanned.unwrap_err(), ArchiveError::OperationCancelled);
    assert!(visited.get());
}

#[test]
fn includes_tar_padding_in_the_gzip_expansion_ratio() {
    let mut gzip = GzEncoder::new(Vec::new(), Compression::best());
    let zeros = [0; READ_CHUNK_BYTES];
    for _ in 0..256 {
        gzip.write_all(&zeros).unwrap();
    }
    let bytes = gzip.finish().unwrap();

    assert_eq!(
        scan(bytes.as_slice(), "tar.gz", |_, _| Ok(()), || Ok(())).unwrap_err(),
        ArchiveError::ExtractionLimitExceeded
    );
}

#[test]
fn rejects_a_declared_body_that_exceeds_the_expanded_archive_budget() {
    let mut header = Header::new_gnu();
    header.set_path("large.bin").unwrap();
    header.set_size(MAX_EXPANDED_BYTES);
    header.set_cksum();

    assert_eq!(
        scan(
            header.as_bytes().as_slice(),
            "tar",
            |_, _| panic!("over-budget entry reached visitor"),
            || Ok(())
        )
        .unwrap_err(),
        ArchiveError::ExtractionLimitExceeded
    );
}

#[test]
fn rejects_oversized_metadata_and_unsupported_gnu_sparse_before_reading_payload() {
    let cases = [
        (
            EntryType::XHeader,
            MAX_EXTENSION_BYTES as u64 + 1,
            ArchiveError::ArchiveTooLarge,
        ),
        (EntryType::GNUSparse, 0, ArchiveError::UnsupportedFormat),
    ];
    for (kind, size, expected) in cases {
        let mut header = Header::new_gnu();
        header.set_entry_type(kind);
        header.set_path("entry").unwrap();
        header.set_size(size);
        header.set_cksum();

        assert_eq!(
            scan(
                header.as_bytes().as_slice(),
                "tar",
                |_, _| panic!("unsupported entry reached visitor"),
                || Ok(())
            )
            .unwrap_err(),
            expected
        );
    }
}

#[test]
fn rejects_binary_sizes_that_would_truncate_when_narrowed() {
    let mut header = Header::new_gnu();
    header.set_path("entry").unwrap();
    header.as_mut_bytes()[124] = 0x81;
    header.set_cksum();

    assert_eq!(
        scan(
            header.as_bytes().as_slice(),
            "tar",
            |_, _| Ok(()),
            || Ok(())
        )
        .unwrap_err(),
        ArchiveError::InvalidArchive
    );
}

#[test]
fn rejects_unsafe_pax_overrides_before_visiting_the_entry() {
    let cases: [(_, &[u8], _); 3] = [
        ("path", b"../outside", ArchiveError::PathTraversal),
        (
            "size",
            b"18446744073709551616",
            ArchiveError::InvalidArchive,
        ),
        ("GNU.sparse.size", b"1024", ArchiveError::UnsupportedFormat),
    ];
    for (key, value, expected) in cases {
        let mut archive = Builder::new(Vec::new());
        archive.append_pax_extensions([(key, value)]).unwrap();
        let mut header = Header::new_gnu();
        header.set_size(0);
        archive
            .append_data(&mut header, "inside", io::empty())
            .unwrap();
        let archive = archive.into_inner().unwrap();

        assert_eq!(
            scan(
                archive.as_slice(),
                "tar",
                |_, _| panic!("unsafe entry reached visitor"),
                || Ok(())
            )
            .unwrap_err(),
            expected
        );
    }
}

#[test]
fn extraction_refuses_tar_links_before_writing_bytes() {
    let cases = [
        (
            EntryType::Link,
            "target".to_owned(),
            ArchiveError::SpecialFile,
        ),
        (
            EntryType::Symlink,
            "a".repeat(120),
            ArchiveError::UnsafeSymlink,
        ),
    ];
    for (kind, target, expected) in cases {
        let mut archive = Builder::new(Vec::new());
        let mut header = Header::new_gnu();
        header.set_entry_type(kind);
        header.set_size(0);
        archive.append_link(&mut header, "link", target).unwrap();
        let archive = archive.into_inner().unwrap();

        assert_eq!(
            crate::stream_entry_matching(
                Cursor::new(archive),
                16,
                None,
                true,
                |_, _| true,
                |bytes| {
                    assert!(bytes.is_empty());
                    Ok(())
                }
            )
            .unwrap_err(),
            expected
        );
    }
}

#[test]
fn rejects_multiple_overrides_for_the_same_link_target() {
    let mut archive = Builder::new(Vec::new());
    archive
        .append_pax_extensions([("linkpath", b"target".as_slice())])
        .unwrap();
    let mut header = Header::new_gnu();
    header.set_entry_type(EntryType::Symlink);
    header.set_size(0);
    archive
        .append_link(&mut header, "link", "a".repeat(120))
        .unwrap();
    let bytes = archive.into_inner().unwrap();

    assert_eq!(
        scan(bytes.as_slice(), "tar", |_, _| Ok(()), || Ok(())).unwrap_err(),
        ArchiveError::InvalidArchive
    );
}

#[test]
fn accepts_global_annotations_but_refuses_global_path_overrides() {
    let cases = [
        (b"13 comment=x\n".as_slice(), false),
        (b"16 path=renamed\n".as_slice(), true),
    ];
    for (extension, reject) in cases {
        let mut archive = Builder::new(Vec::new());
        let mut global = Header::new_gnu();
        global.set_entry_type(EntryType::XGlobalHeader);
        global.set_size(extension.len() as u64);
        archive
            .append_data(&mut global, "global", extension)
            .unwrap();

        let mut file = Header::new_gnu();
        file.set_size(0);
        archive
            .append_data(&mut file, "original.txt", io::empty())
            .unwrap();
        let bytes = archive.into_inner().unwrap();
        let result = scan(bytes.as_slice(), "tar", |_, _| Ok(()), || Ok(()));
        if reject {
            assert_eq!(result.unwrap_err(), ArchiveError::UnsupportedFormat);
        } else {
            assert_eq!(result.unwrap().entries[0].path, "original.txt");
        }
    }
}

#[test]
fn omits_root_directory_metadata_and_rejects_duplicate_destinations() {
    let mut archive = Builder::new(Vec::new());
    let mut root = Header::new_gnu();
    root.set_entry_type(EntryType::Directory);
    root.set_size(0);
    root.as_mut_bytes()[..2].copy_from_slice(b"./");
    root.set_cksum();
    archive.append(&root, io::empty()).unwrap();

    let mut file = Header::new_gnu();
    file.set_size(0);
    archive
        .append_data(&mut file, "entry", io::empty())
        .unwrap();
    archive
        .append_data(&mut file, "entry", io::empty())
        .unwrap();
    let bytes = archive.into_inner().unwrap();

    let mut visited = Vec::new();
    assert_eq!(
        scan(
            bytes.as_slice(),
            "tar",
            |entry, _| {
                visited.push(entry.path.clone());
                Ok(())
            },
            || Ok(())
        )
        .unwrap_err(),
        ArchiveError::DuplicateEntry
    );
    assert_eq!(visited, ["entry"]);
}

#[test]
fn rejects_premature_end_of_a_declared_entry_body() {
    let mut header = Header::new_gnu();
    header.set_path("entry").unwrap();
    header.set_size(4);
    header.set_cksum();
    let bytes = header.as_bytes().as_slice().chain(b"x".as_slice());
    assert_eq!(
        scan(bytes, "tar", |_, _| Ok(()), || Ok(())).unwrap_err(),
        ArchiveError::TruncatedArchive
    );
}
