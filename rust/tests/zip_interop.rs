use std::ffi::{CStr, CString, c_char};
use std::io::Cursor;

use nitro_archive_core::{inspect, read_entry};

const INTEROP: &[u8] = include_bytes!("fixtures/interop.zip");
const EMPTY: &[u8] = include_bytes!("fixtures/empty.zip");
const ZIP64: &[u8] = include_bytes!("fixtures/zip64.zip");
const ZIPCRYPTO: &[u8] = include_bytes!("fixtures/zipcrypto.zip");
const AES256_AE1: &[u8] = include_bytes!("fixtures/aes256-ae1.zip");
const AES256_AE2: &[u8] = include_bytes!("fixtures/aes256-ae2.zip");
const PASSWORD: &[u8] = b"archive-test-password";

unsafe extern "C" {
    fn nitro_archive_inspect_v1(bytes: *const u8, length: usize) -> *mut c_char;
    fn nitro_archive_inspect_file_v1(path: *const c_char) -> *mut c_char;
    fn nitro_archive_detect_v1(bytes: *const u8, length: usize) -> *mut c_char;
    fn nitro_archive_free_json_v1(json: *mut c_char);
    fn nitro_archive_read_entry_v1(
        bytes: *const u8,
        length: usize,
        path: *const c_char,
        password: *const u8,
        password_length: usize,
        limit: u64,
    ) -> ReadResult;
    fn nitro_archive_read_file_entry_v1(
        archive_path: *const c_char,
        path: *const c_char,
        password: *const u8,
        password_length: usize,
        limit: u64,
    ) -> ReadResult;
    fn nitro_archive_free_bytes_v1(result: ReadResult);
}

#[repr(C)]
struct ReadResult {
    bytes: *mut u8,
    length: usize,
    error: *mut c_char,
}

#[test]
fn inspects_archives_created_by_cpython() {
    let archive = inspect(Cursor::new(INTEROP)).expect("CPython ZIP opens");
    assert_eq!(archive.entries.len(), 3);
    assert_eq!(archive.total_uncompressed_size, 1036);
    assert_eq!(archive.comment.as_deref(), Some("independent ZIP fixture"));
    assert!(!archive.encrypted);

    let stored = &archive.entries[0];
    assert_eq!(stored.path, "stored.txt");
    assert_eq!(stored.compression_method, "store");
    assert_eq!(stored.compressed_size, 12);
    assert_eq!(stored.uncompressed_size, 12);
    assert_eq!(stored.crc32, Some(0x89d3ee91));

    assert_eq!(archive.entries[1].path, "files/");
    assert_eq!(archive.entries[1].kind, "directory");

    let deflated = &archive.entries[2];
    assert_eq!(deflated.path, "files/café.txt");
    assert_eq!(deflated.compression_method, "deflate");
    assert_eq!(deflated.uncompressed_size, 1024);
    assert_eq!(deflated.crc32, Some(0x3017bf58));
}

#[test]
fn accepts_empty_zip_and_zip64_end_records() {
    assert!(inspect(Cursor::new(EMPTY)).unwrap().entries.is_empty());
    assert!(ZIP64.windows(4).any(|bytes| bytes == b"PK\x06\x06"));
    assert!(ZIP64.windows(4).any(|bytes| bytes == b"PK\x06\x07"));

    let archive = inspect(Cursor::new(ZIP64)).unwrap();
    assert_eq!(archive.entries.len(), 1);
    assert_eq!(archive.entries[0].path, "zip64.txt");
    assert_eq!(archive.entries[0].uncompressed_size, 14);
    assert_eq!(
        read_entry(Cursor::new(ZIP64), 0, 14, None).unwrap(),
        b"ZIP64 payload\n"
    );
}

#[test]
fn reads_stored_and_deflated_bytes_with_limits() {
    assert_eq!(
        read_entry(Cursor::new(INTEROP), 0, 12, None).unwrap(),
        b"stored text\n"
    );
    assert_eq!(
        read_entry(Cursor::new(INTEROP), 2, 1024, None).unwrap(),
        b"compressed line\n".repeat(64)
    );
    assert_eq!(
        read_entry(Cursor::new(INTEROP), 2, 1023, None)
            .unwrap_err()
            .code(),
        "E_BUFFER_LIMIT_EXCEEDED"
    );
    assert_eq!(
        read_entry(Cursor::new(INTEROP), 3, 1024, None)
            .unwrap_err()
            .code(),
        "E_ENTRY_NOT_FOUND"
    );
}

#[test]
fn rejects_incomplete_zip_and_corrupted_stored_data() {
    assert_eq!(
        inspect(Cursor::new(&ZIP64[..ZIP64.len() - 22]))
            .unwrap_err()
            .code(),
        "E_INVALID_ARCHIVE"
    );

    let mut edited = INTEROP.to_vec();
    let start = edited
        .windows(b"stored text\n".len())
        .position(|bytes| bytes == b"stored text\n")
        .expect("fixture has a stored payload");
    edited[start] ^= 1;

    assert_eq!(
        read_entry(Cursor::new(edited), 0, 12, None)
            .unwrap_err()
            .code(),
        "E_CHECKSUM_MISMATCH"
    );
}

#[test]
fn reads_an_info_zip_encrypted_entry_with_the_correct_password() {
    let archive = inspect(Cursor::new(ZIPCRYPTO)).expect("encrypted ZIP metadata is readable");
    assert!(archive.encrypted);
    assert!(archive.entries[0].encrypted);
    assert_eq!(
        read_entry(Cursor::new(ZIPCRYPTO), 0, 15, None)
            .unwrap_err()
            .code(),
        "E_PASSWORD_REQUIRED"
    );
    assert_eq!(
        read_entry(Cursor::new(ZIPCRYPTO), 0, 15, Some(b"wrong"))
            .unwrap_err()
            .code(),
        "E_BAD_PASSWORD"
    );
    assert_eq!(
        read_entry(Cursor::new(ZIPCRYPTO), 0, 15, Some(PASSWORD)).unwrap(),
        b"encrypted text\n"
    );
}

#[test]
fn reads_aes256_variants_created_by_libarchive() {
    let cases: [(&[u8], &[u8]); 2] = [
        (AES256_AE1, b"AES ciphertext test content\n"),
        (AES256_AE2, b"AES payload\n"),
    ];

    for (fixture, expected) in cases {
        let archive = inspect(Cursor::new(fixture)).expect("AES ZIP metadata is readable");
        assert!(archive.encrypted);
        assert!(archive.entries[0].encrypted);
        assert_eq!(archive.entries[0].compression_method, "deflate");

        let limit = expected.len() as u64;
        assert_eq!(
            read_entry(Cursor::new(fixture), 0, limit, Some(PASSWORD)).unwrap(),
            expected
        );
        assert_eq!(
            read_entry(Cursor::new(fixture), 0, limit, Some(b"wrong"))
                .unwrap_err()
                .code(),
            "E_BAD_PASSWORD"
        );
    }
}

#[test]
fn withholds_aes256_plaintext_on_authentication_failure() {
    let mut edited = AES256_AE2.to_vec();
    let descriptor = edited
        .windows(4)
        .position(|bytes| bytes == b"PK\x07\x08")
        .expect("fixture has a data descriptor after the authentication tag");
    edited[descriptor - 1] ^= 1;

    assert!(read_entry(Cursor::new(edited), 0, 12, Some(PASSWORD)).is_err());
}

#[test]
fn c_abi_round_trips_inspection_and_reports_invalid_arguments() {
    let result = inspect_over_c_abi(Some(INTEROP));
    assert_eq!(result["entries"][2]["path"], "files/café.txt");
    assert_eq!(result["totalUncompressedSize"], 1036);
    assert_eq!(inspect_over_c_abi(None)["error"], "E_INVALID_ARGUMENT");
}

#[test]
fn detects_real_containers_and_leaves_arbitrary_input_unknown() {
    for (bytes, expected) in [
        (EMPTY, serde_json::json!("zip")),
        (
            include_bytes!("fixtures/gnu-long.tar"),
            serde_json::json!("tar"),
        ),
        (
            include_bytes!("fixtures/pax.tar.gz"),
            serde_json::json!("tar.gz"),
        ),
        (b"arbitrary bytes".as_slice(), serde_json::Value::Null),
    ] {
        // SAFETY: The test fixture is immutable and live throughout the call.
        let result = parse_json(unsafe { nitro_archive_detect_v1(bytes.as_ptr(), bytes.len()) });
        assert_eq!(result["format"], expected);
    }
}

#[test]
fn c_abi_supports_seekable_paths_and_verified_entry_buffers() {
    let path = CString::new(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/tests/fixtures/zip64.zip"
    ))
    .unwrap();
    // SAFETY: The path is a live C string; parse_json releases the returned result.
    let catalog = parse_json(unsafe { nitro_archive_inspect_file_v1(path.as_ptr()) });
    assert_eq!(catalog["entries"][0]["path"], "zip64.txt");

    // SAFETY: Both paths are live C strings and the password is absent.
    let result = unsafe {
        nitro_archive_read_file_entry_v1(
            path.as_ptr(),
            c"zip64.txt".as_ptr(),
            std::ptr::null(),
            0,
            14,
        )
    };
    assert_eq!(copy_read_result(result).unwrap(), b"ZIP64 payload\n");
    assert_eq!(
        read_over_c_abi(c"files/café.txt", 1024).unwrap(),
        b"compressed line\n".repeat(64)
    );
    assert!(read_over_c_abi(c"files/", 0).unwrap().is_empty());
    assert_eq!(
        read_over_c_abi(c"stored.txt", 11).unwrap_err(),
        "E_BUFFER_LIMIT_EXCEEDED"
    );
}

#[test]
fn c_abi_rejects_invalid_paths_and_excessive_buffer_lengths() {
    // SAFETY: A zero-length input needs no allocation or live buffer.
    let short = unsafe { nitro_archive_inspect_v1(std::ptr::null(), 0) };
    assert_eq!(parse_json(short)["error"], "E_TRUNCATED_ARCHIVE");
    // SAFETY: The ABI rejects this count before dereferencing any input bytes.
    let oversized = unsafe { nitro_archive_inspect_v1(std::ptr::null(), usize::MAX) };
    assert_eq!(parse_json(oversized)["error"], "E_ARCHIVE_TOO_LARGE");

    let bad_encoding = c"\xff";
    let missing = CString::new(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/missing.zip")).unwrap();
    for (path, expected) in [
        (bad_encoding.as_ptr(), "E_INVALID_ARGUMENT"),
        (std::ptr::null(), "E_INVALID_ARGUMENT"),
        (missing.as_ptr(), "E_IO"),
    ] {
        // SAFETY: The non-null paths are live C strings; null exercises argument validation.
        let result = unsafe { nitro_archive_inspect_file_v1(path) };
        assert_eq!(parse_json(result)["error"], expected);
    }
}

#[test]
fn reports_split_archives_and_unavailable_compression() {
    let mut split = EMPTY.to_vec();
    split[4] = 1;
    assert_eq!(
        inspect(Cursor::new(split)).unwrap_err().code(),
        "E_UNSUPPORTED_FORMAT"
    );

    let central = INTEROP
        .windows(4)
        .position(|bytes| bytes == b"PK\x01\x02")
        .unwrap();
    for (method, name) in [(12, "bzip2"), (14, "lzma"), (93, "zstd"), (11, "unknown")] {
        let mut unsupported = INTEROP.to_vec();
        unsupported[8] = method;
        unsupported[central + 10] = method;
        let archive = inspect(Cursor::new(&unsupported)).unwrap();
        assert_eq!(archive.entries[0].compression_method, name);
        assert_eq!(
            read_entry(Cursor::new(unsupported), 0, 12, None)
                .unwrap_err()
                .to_string(),
            "E_UNSUPPORTED_COMPRESSION"
        );
    }
}

#[test]
fn rejects_out_of_budget_directory_metadata_and_ambiguous_names() {
    let mut over_budget = EMPTY.to_vec();
    over_budget[8..10].copy_from_slice(&10001u16.to_le_bytes());
    over_budget[10..12].copy_from_slice(&10001u16.to_le_bytes());
    assert_eq!(
        inspect(Cursor::new(over_budget)).unwrap_err().code(),
        "E_ARCHIVE_TOO_LARGE"
    );

    for (paths, code) in [
        (&["a/./b", "a/b"][..], "E_DUPLICATE_ENTRY"),
        (&["../outside.txt"][..], "E_PATH_TRAVERSAL"),
        (&["C:/outside.txt"][..], "E_ABSOLUTE_PATH"),
    ] {
        let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
        for path in paths {
            writer
                .start_file(*path, zip::write::SimpleFileOptions::default())
                .unwrap();
        }
        let archive = writer.finish().unwrap();
        assert_eq!(inspect(archive).unwrap_err().code(), code);
    }
}

#[test]
fn checks_local_and_central_header_agreement_and_directory_bounds() {
    let central = INTEROP
        .windows(4)
        .position(|bytes| bytes == b"PK\x01\x02")
        .unwrap();
    let mut inconsistent = INTEROP.to_vec();
    inconsistent[central + 46] = b'S';
    assert_eq!(
        inspect(Cursor::new(inconsistent)).unwrap_err().code(),
        "E_INVALID_ARCHIVE"
    );

    let mut unindexed = INTEROP.to_vec();
    let end = unindexed
        .windows(4)
        .rposition(|bytes| bytes == b"PK\x05\x06")
        .unwrap();
    unindexed[end + 8] = 2;
    unindexed[end + 10] = 2;
    assert_eq!(
        inspect(Cursor::new(unindexed)).unwrap_err().code(),
        "E_INVALID_ARCHIVE"
    );
}

#[test]
fn bounds_path_length_and_depth_and_preserves_link_metadata() {
    for path in ["x".repeat(1025), "a/".repeat(33)] {
        let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
        writer
            .start_file(path, zip::write::SimpleFileOptions::default())
            .unwrap();
        assert_eq!(
            inspect(writer.finish().unwrap()).unwrap_err().code(),
            "E_ARCHIVE_TOO_LARGE"
        );
    }

    let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
    writer
        .add_symlink(
            "alias",
            "data.txt",
            zip::write::SimpleFileOptions::default(),
        )
        .unwrap();
    let catalog = inspect(writer.finish().unwrap()).unwrap();
    assert_eq!(catalog.entries[0].kind, "symlink");
}

fn inspect_over_c_abi(bytes: Option<&[u8]>) -> serde_json::Value {
    let (input, length) = bytes.map_or((std::ptr::null(), 1), |data| (data.as_ptr(), data.len()));

    // SAFETY: The slice is live and shared for the synchronous call. The null
    // case exercises validation before the function can read the input.
    parse_json(unsafe { nitro_archive_inspect_v1(input, length) })
}

fn parse_json(output: *mut c_char) -> serde_json::Value {
    assert!(!output.is_null(), "the C ABI returned no JSON");

    // SAFETY: The returned pointer owns a NUL-terminated string. Parse it
    // while it is live and free it once through the owning allocator's API.
    let result = unsafe {
        let parsed = serde_json::from_slice(CStr::from_ptr(output).to_bytes());
        nitro_archive_free_json_v1(output);
        parsed
    };
    result.expect("the C ABI returned valid JSON")
}

fn read_over_c_abi(path: &CStr, limit: u64) -> Result<Vec<u8>, String> {
    // SAFETY: All borrowed data stays live for the call. The password is absent.
    let result = unsafe {
        nitro_archive_read_entry_v1(
            INTEROP.as_ptr(),
            INTEROP.len(),
            path.as_ptr(),
            std::ptr::null(),
            0,
            limit,
        )
    };
    copy_read_result(result)
}

fn copy_read_result(result: ReadResult) -> Result<Vec<u8>, String> {
    // SAFETY: The result owns the returned pointers. Copy their contents before
    // releasing exactly once with the allocator that created them.
    unsafe {
        let value = if !result.error.is_null() {
            Err(CStr::from_ptr(result.error).to_str().unwrap().to_owned())
        } else if result.length == 0 {
            Ok(Vec::new())
        } else {
            Ok(std::slice::from_raw_parts(result.bytes, result.length).to_vec())
        };
        nitro_archive_free_bytes_v1(result);
        value
    }
}
