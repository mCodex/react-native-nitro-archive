use std::ffi::{CStr, CString, c_char};
use std::fs::File;
use std::io::Cursor;
use std::panic::catch_unwind;
use std::ptr;
use std::slice;

use crate::{ArchiveError, Inspection, inspect};

const MAX_INPUT_BYTES: usize = 512 * 1024 * 1024;

/// Inspect a host buffer and return an owned, NUL-terminated UTF-8 JSON result.
///
/// # Safety
///
/// For nonzero lengths within the input cap, the caller must provide a live
/// readable range of at least `length` bytes and must not mutate it until return.
/// The returned allocation must be released exactly once with the matching free function.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn nitro_archive_inspect_v1(bytes: *const u8, length: usize) -> *mut c_char {
    inspection_json(|| {
        if length > MAX_INPUT_BYTES {
            Err(ArchiveError::ArchiveTooLarge)
        } else if length == 0 {
            inspect(Cursor::new(&[]))
        } else if bytes.is_null() {
            Err(ArchiveError::InvalidArgument)
        } else {
            // SAFETY: The caller owns a live, initialized and immutable range for
            // the call. u8 has alignment one and the checked cap is below isize::MAX.
            let input = unsafe { slice::from_raw_parts(bytes, length) };
            inspect(Cursor::new(input))
        }
    })
}

/// Inspect an archive through a seekable platform file.
///
/// # Safety
///
/// The path must be a readable NUL-terminated UTF-8 string that stays immutable until return.
/// The caller must have authority to open the file and preserve a stable snapshot during inspection.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn nitro_archive_inspect_file_v1(path: *const c_char) -> *mut c_char {
    inspection_json(|| {
        if path.is_null() {
            return Err(ArchiveError::InvalidArgument);
        }
        // SAFETY: The caller supplies a live, NUL-terminated immutable C string for this call.
        let path = unsafe { CStr::from_ptr(path) }
            .to_str()
            .map_err(|_| ArchiveError::InvalidArgument)?;
        inspect(File::open(path)?)
    })
}

fn inspection_json(
    operation: impl FnOnce() -> Result<Inspection, ArchiveError> + std::panic::UnwindSafe,
) -> *mut c_char {
    let result = catch_unwind(|| {
        let json = match operation() {
            Ok(inspection) => serde_json::to_vec(&inspection),
            Err(error) => serde_json::to_vec(&serde_json::json!({ "error": error.code() })),
        };
        json.ok().and_then(|json| CString::new(json).ok())
    });

    match result {
        Ok(Some(json)) => json.into_raw(),
        _ => ptr::null_mut(),
    }
}

/// Release an inspection result from this version of the ABI.
///
/// # Safety
///
/// The pointer must be null or an outstanding allocation from
/// an inspection function in this ABI. The host must finish reading it before freeing.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn nitro_archive_free_json_v1(json: *mut c_char) {
    if !json.is_null() {
        // SAFETY: The C ABI gives the caller exclusive ownership of this
        // allocation and requires it to return exactly the original pointer once.
        drop(unsafe { CString::from_raw(json) });
    }
}

#[repr(C)]
pub struct NitroArchiveBytesResult {
    bytes: *mut u8,
    length: usize,
    error: *mut c_char,
}

/// Read and verify one entry from a borrowed archive buffer.
///
/// # Safety
///
/// Nonempty buffers must point to live, immutable ranges of the supplied lengths.
/// The entry path must remain a live, NUL-terminated C string. The caller must free
/// the returned result exactly once with `nitro_archive_free_bytes_v1`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn nitro_archive_read_entry_v1(
    archive_bytes: *const u8,
    archive_length: usize,
    entry_path: *const c_char,
    password: *const u8,
    password_length: usize,
    limit: u64,
) -> NitroArchiveBytesResult {
    bytes_result(|| {
        // SAFETY: The caller retains each input for the duration of this closure.
        let archive = unsafe { borrow_bytes(archive_bytes, archive_length, MAX_INPUT_BYTES) }?;
        // SAFETY: The caller retains the NUL-terminated entry path for this call.
        let entry_path = unsafe { borrow_path(entry_path) }?;
        // SAFETY: The caller retains the password buffer for this call.
        let password = unsafe { borrow_bytes(password, password_length, MAX_PASSWORD_BYTES) }?;
        read_by_path(Cursor::new(archive), entry_path, password, limit)
    })
}

/// Read and verify one entry from a seekable platform file.
///
/// # Safety
///
/// Both paths must remain live, NUL-terminated C strings. The password buffer
/// must be valid for the supplied length. The caller must have authority to read
/// the archive and preserve a stable snapshot for the call.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn nitro_archive_read_file_entry_v1(
    archive_path: *const c_char,
    entry_path: *const c_char,
    password: *const u8,
    password_length: usize,
    limit: u64,
) -> NitroArchiveBytesResult {
    bytes_result(|| {
        // SAFETY: The caller retains both NUL-terminated paths for this call.
        let archive_path = unsafe { borrow_path(archive_path) }?;
        // SAFETY: The caller retains the NUL-terminated entry path for this call.
        let entry_path = unsafe { borrow_path(entry_path) }?;
        // SAFETY: The caller retains the password buffer for this call.
        let password = unsafe { borrow_bytes(password, password_length, MAX_PASSWORD_BYTES) }?;
        read_by_path(File::open(archive_path)?, entry_path, password, limit)
    })
}

const MAX_PASSWORD_BYTES: usize = 4096;

unsafe fn borrow_bytes<'a>(
    bytes: *const u8,
    length: usize,
    max_bytes: usize,
) -> Result<&'a [u8], ArchiveError> {
    if length > max_bytes {
        return Err(ArchiveError::ArchiveTooLarge);
    }
    if length == 0 {
        return Ok(&[]);
    }
    if bytes.is_null() {
        return Err(ArchiveError::InvalidArgument);
    }
    // SAFETY: The caller guarantees initialized, immutable bytes for the call.
    // Both allowed limits are below isize::MAX and u8 requires alignment one.
    Ok(unsafe { slice::from_raw_parts(bytes, length) })
}

unsafe fn borrow_path<'a>(path: *const c_char) -> Result<&'a str, ArchiveError> {
    if path.is_null() {
        return Err(ArchiveError::InvalidArgument);
    }
    // SAFETY: The caller guarantees a live, immutable NUL-terminated string.
    unsafe { CStr::from_ptr(path) }
        .to_str()
        .map_err(|_| ArchiveError::InvalidArgument)
}

fn read_by_path(
    reader: impl std::io::Read + std::io::Seek,
    path: &str,
    password: &[u8],
    limit: u64,
) -> Result<Vec<u8>, ArchiveError> {
    let password = (!password.is_empty()).then_some(password);
    crate::read_entry_matching(reader, limit, password, |_, entry| {
        entry.path == path || entry.raw_path == path
    })
}

fn bytes_result(
    operation: impl FnOnce() -> Result<Vec<u8>, ArchiveError> + std::panic::UnwindSafe,
) -> NitroArchiveBytesResult {
    match catch_unwind(operation) {
        Ok(Ok(bytes)) => {
            let length = bytes.len();
            let bytes = if length == 0 {
                ptr::null_mut()
            } else {
                Box::into_raw(bytes.into_boxed_slice()).cast::<u8>()
            };
            NitroArchiveBytesResult {
                bytes,
                length,
                error: ptr::null_mut(),
            }
        }
        failed => {
            let code = match failed {
                Ok(Err(error)) => error.code(),
                _ => "E_INTERNAL",
            };
            let error = CString::new(code).map_or(ptr::null_mut(), CString::into_raw);
            NitroArchiveBytesResult {
                bytes: ptr::null_mut(),
                length: 0,
                error,
            }
        }
    }
}

/// Release a read result from this version of the ABI.
///
/// # Safety
///
/// The result must come unmodified from a read entry call and be freed once.
/// The host must finish reading the result before returning ownership.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn nitro_archive_free_bytes_v1(result: NitroArchiveBytesResult) {
    if !result.bytes.is_null() {
        let bytes = ptr::slice_from_raw_parts_mut(result.bytes, result.length);
        // SAFETY: The read result exclusively owns the original Rust boxed slice.
        drop(unsafe { Box::from_raw(bytes) });
    }
    // SAFETY: A nonnull error is an owned CString, allocated exactly as JSON is.
    unsafe { nitro_archive_free_json_v1(result.error) };
}
