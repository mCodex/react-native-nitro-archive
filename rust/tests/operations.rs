use std::ffi::{CStr, CString, c_char, c_void};
use std::fs::{self, File, OpenOptions};
use std::io::{self, Cursor};
use std::os::fd::AsRawFd;
use std::path::Path;
use std::sync::Mutex;

use nitro_archive_core::{inspect, read_entry};
use serde_json::{Value, json};

type Progress = unsafe extern "C" fn(*mut c_void, u64, u64) -> i32;

unsafe extern "C" {
    fn nitro_archive_operation_v1(
        request: *const c_char,
        password: *const u8,
        password_length: usize,
        progress: Option<Progress>,
        context: *mut c_void,
    ) -> *mut c_char;
    fn nitro_archive_detect_file_v1(path: *const c_char) -> *mut c_char;
    fn nitro_archive_free_json_v1(json: *mut c_char);
}

fn decode(response: *mut c_char) -> Value {
    assert!(!response.is_null());
    // SAFETY: The response is a live, owned C string from the Rust ABI.
    let json = unsafe { CStr::from_ptr(response) }.to_bytes();
    let value = serde_json::from_slice(json);
    // SAFETY: Release the original pointer exactly once, after parsing finishes.
    unsafe { nitro_archive_free_json_v1(response) };
    value.unwrap()
}

fn call(request: Value, password: &[u8], progress: Option<Progress>) -> Value {
    static OPERATIONS: Mutex<()> = Mutex::new(());
    let _guard = OPERATIONS.lock().unwrap();
    let request = CString::new(serde_json::to_vec(&request).unwrap()).unwrap();
    // SAFETY: The request and password live until return. Test callbacks ignore context.
    decode(unsafe {
        nitro_archive_operation_v1(
            request.as_ptr(),
            password.as_ptr(),
            password.len(),
            progress,
            std::ptr::null_mut(),
        )
    })
}

fn output(path: &Path) -> io::Result<File> {
    OpenOptions::new()
        .read(true)
        .write(true)
        .create_new(true)
        .open(path)
}

fn make_archive(
    format: &str,
    encryption: &str,
    source: &Path,
    output: &File,
    password: &[u8],
) -> Value {
    call(
        json!({
            "operation": "create",
            "format": format,
            "outputFd": output.as_raw_fd(),
            "encryptionMethod": encryption,
            "entries": [
                { "kind": "directory", "path": "documents/" },
                { "kind": "file", "path": "documents/message.txt",
                  "sourcePath": source, "modifiedAt": 1700000000000_i64 },
            ],
        }),
        password,
        None,
    )
}

#[test]
fn round_trips_creation_detection_reading_and_extraction() {
    let directory = tempfile::tempdir().unwrap();
    let source = directory.path().join("message.txt");
    let bytes = (0u8..=250).collect::<Vec<_>>().repeat(200);
    fs::write(&source, &bytes).unwrap();

    for format in ["zip", "tar", "tar.gz"] {
        let archive_path = directory.path().join(format);
        let archive = output(&archive_path).unwrap();
        let created = make_archive(format, "none", &source, &archive, &[]);
        assert_eq!(created["entryCount"], 2, "{created}");
        assert_eq!(created["inputBytes"], bytes.len());
        assert_eq!(created["outputBytes"], archive.metadata().unwrap().len());

        let path = CString::new(archive_path.to_str().unwrap()).unwrap();
        // SAFETY: The path is a live C string and the archive is test-owned.
        let detected = decode(unsafe { nitro_archive_detect_file_v1(path.as_ptr()) });
        assert_eq!(detected["format"], format);
        let inspection = inspect(File::open(&archive_path).unwrap()).unwrap();
        assert_eq!(inspection.format, format);
        assert_eq!(inspection.entries[1].path, "documents/message.txt");
        assert_eq!(
            read_entry(
                File::open(&archive_path).unwrap(),
                1,
                bytes.len() as u64,
                None
            )
            .unwrap(),
            bytes,
        );

        let extracted_path = directory.path().join(format!("extracted-{format}"));
        let extracted = output(&extracted_path).unwrap();
        let extract_request = |limit| {
            json!({
                "operation": "extract",
                "archivePath": archive_path,
                "entryPath": "documents/message.txt",
                "outputFd": extracted.as_raw_fd(),
                "limit": limit,
            })
        };
        let limited = call(extract_request(10), &[], None);
        assert_eq!(limited["error"], "E_EXTRACTION_LIMIT_EXCEEDED", "{limited}");
        assert_eq!(extracted.metadata().unwrap().len(), 0);
        let result = call(extract_request(bytes.len()), &[], None);
        assert_eq!(result["writtenBytes"], bytes.len(), "{result}");
        assert_eq!(fs::read(extracted_path).unwrap(), bytes);
    }
}

#[test]
fn creates_and_reads_aes_and_legacy_encrypted_zip() {
    let directory = tempfile::tempdir().unwrap();
    let source = directory.path().join("message.txt");
    let bytes = b"public encryption test fixture".repeat(10);
    fs::write(&source, &bytes).unwrap();

    for encryption in ["aes-256", "zip-crypto"] {
        let archive_path = directory.path().join(encryption);
        let archive = output(&archive_path).unwrap();
        let created = make_archive("zip", encryption, &source, &archive, b"fixture-password");
        assert_eq!(created["entryCount"], 2, "{created}");
        let data = fs::read(&archive_path).unwrap();
        assert!(inspect(Cursor::new(&data)).unwrap().entries[1].encrypted);
        assert_eq!(
            read_entry(Cursor::new(&data), 1, 300, Some(b"wrong"))
                .unwrap_err()
                .code(),
            "E_BAD_PASSWORD",
        );
        assert_eq!(
            read_entry(Cursor::new(&data), 1, 300, Some(b"fixture-password")).unwrap(),
            bytes,
        );
    }
}

#[test]
fn rejects_conflicting_paths_and_preserves_existing_output() {
    let directory = tempfile::tempdir().unwrap();
    let target = directory.path().join("archive.zip");
    let scratch = output(&target).unwrap();
    let request = |entries| {
        json!({
            "operation": "create", "format": "zip", "outputFd": scratch.as_raw_fd(),
            "entries": entries,
        })
    };

    for paths in [["a", "a/file"], ["a", "./a"]] {
        let result = call(
            request(json!([
                { "kind": "file", "path": paths[0], "sourcePath": "/missing" },
                { "kind": "file", "path": paths[1], "sourcePath": "/missing" },
            ])),
            &[],
            None,
        );
        assert_eq!(result["error"], "E_DUPLICATE_ENTRY", "{result}");
        assert_eq!(scratch.metadata().unwrap().len(), 0);
    }

    fs::write(&target, b"existing").unwrap();
    let result = call(request(json!([])), &[], None);
    assert_eq!(result["error"], "E_INVALID_ARGUMENT", "{result}");
    assert_eq!(fs::read(target).unwrap(), b"existing");
}

#[test]
fn cancels_during_creation_and_recovers_the_operation_slot() {
    unsafe extern "C" fn cancel_after_input(_: *mut c_void, bytes: u64, _: u64) -> i32 {
        i32::from(bytes > 0)
    }

    let directory = tempfile::tempdir().unwrap();
    let source = directory.path().join("message.txt");
    fs::write(&source, b"cancelled").unwrap();

    let cancelled = output(&directory.path().join("cancelled.zip")).unwrap();
    let result = call(
        json!({
            "operation": "create", "format": "zip", "outputFd": cancelled.as_raw_fd(),
            "entries": [{ "kind": "file", "path": "message.txt", "sourcePath": source }],
        }),
        &[],
        Some(cancel_after_input),
    );
    assert_eq!(result["error"], "E_OPERATION_CANCELLED", "{result}");

    let fresh = output(&directory.path().join("success.zip")).unwrap();
    assert_eq!(
        make_archive("zip", "none", &source, &fresh, &[])["entryCount"],
        2
    );
}

#[test]
fn validates_creation_options_before_writing() {
    let directory = tempfile::tempdir().unwrap();
    let target = output(&directory.path().join("archive")).unwrap();
    let fd = target.as_raw_fd();
    for (operation, error) in [
        (
            json!({ "format": "zip", "compressionLevel": 10 }),
            "E_INVALID_ARGUMENT",
        ),
        (
            json!({ "format": "zip", "encryptionMethod": "aes-256" }),
            "E_PASSWORD_REQUIRED",
        ),
        (
            json!({ "format": "tar", "encryptionMethod": "aes-256" }),
            "E_UNSUPPORTED_ENCRYPTION",
        ),
        (json!({ "format": "7z" }), "E_UNSUPPORTED_FORMAT"),
        (
            json!({ "format": "zip", "outputFd": -1 }),
            "E_INVALID_ARGUMENT",
        ),
        (
            json!({ "format": "zip", "entries": [{ "kind": "file", "path": "missing" }] }),
            "E_INVALID_ARGUMENT",
        ),
    ] {
        let mut request = json!({ "operation": "create", "outputFd": fd, "entries": [] });
        request
            .as_object_mut()
            .unwrap()
            .extend(operation.as_object().unwrap().clone());
        let result = call(request, &[], None);
        assert_eq!(result["error"], error, "{result}");
        assert_eq!(target.metadata().unwrap().len(), 0);
    }
}

#[test]
fn opens_only_regular_creation_sources() {
    let directory = tempfile::tempdir().unwrap();
    let source = directory.path().join("regular.txt");
    fs::write(&source, b"test").unwrap();
    let link = directory.path().join("alias.txt");
    std::os::unix::fs::symlink(source, &link).unwrap();

    for (source, error) in [
        (link.as_path(), "E_UNSAFE_SYMLINK"),
        (directory.path(), "E_SPECIAL_FILE"),
        (Path::new("relative.txt"), "E_INVALID_ARGUMENT"),
        (Path::new("/__nitro_archive_test_missing__"), "E_IO"),
    ] {
        let target_path = directory.path().join(format!("{error}.zip"));
        let target = output(&target_path).unwrap();
        let result = call(
            json!({
                "operation": "create",
                "format": "zip",
                "outputFd": target.as_raw_fd(),
                "entries": [{ "kind": "file", "path": "file.txt", "sourcePath": source }],
            }),
            &[],
            None,
        );
        assert_eq!(result["error"], error, "{result}");
    }
}
