use std::ffi::{CStr, CString, c_char, c_void};
use std::fs::OpenOptions;
use std::os::fd::AsRawFd;
use std::sync::{Condvar, Mutex, mpsc};
use std::time::Duration;

use nitro_archive_core::inspect;
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
    fn nitro_archive_free_json_v1(json: *mut c_char);
}

struct Gate {
    arrivals: mpsc::Sender<()>,
    release: Mutex<bool>,
    changed: Condvar,
}

unsafe extern "C" fn hold_operation(context: *mut c_void, _: u64, _: u64) -> i32 {
    // SAFETY: The test borrows the gate until all scoped workers finish.
    let gate = unsafe { &*context.cast::<Gate>() };
    if gate.arrivals.send(()).is_err() {
        return 1;
    }
    gate.release
        .lock()
        .ok()
        .and_then(|released| {
            gate.changed
                .wait_timeout_while(released, Duration::from_secs(10), |value| !*value)
                .ok()
        })
        .map_or(1, |(released, _)| i32::from(!*released))
}

fn empty_archive(fd: i32, gate: Option<&Gate>) -> Value {
    let request = CString::new(
        json!({ "operation": "create", "format": "zip", "entries": [], "outputFd": fd })
            .to_string(),
    )
    .unwrap();
    let context = gate.map_or(std::ptr::null_mut(), |gate| {
        std::ptr::from_ref(gate).cast_mut().cast()
    });
    let progress = gate.map(|_| hold_operation as Progress);

    // SAFETY: The test owns each output descriptor, the request and the callback context.
    let response = unsafe {
        nitro_archive_operation_v1(request.as_ptr(), std::ptr::null(), 0, progress, context)
    };
    assert!(!response.is_null());
    // SAFETY: Parse the live response and release it once with its allocator.
    let result = unsafe {
        let parsed = serde_json::from_slice(CStr::from_ptr(response).to_bytes());
        nitro_archive_free_json_v1(response);
        parsed
    };
    result.unwrap()
}

#[test]
fn bounds_concurrent_jobs_and_releases_admission_permits() {
    let storage = tempfile::tempdir().unwrap();
    let (arrivals, receiver) = mpsc::channel();
    let gate = Gate {
        arrivals,
        release: Mutex::new(false),
        changed: Condvar::new(),
    };
    let make_output = |index: usize| {
        OpenOptions::new()
            .create_new(true)
            .read(true)
            .write(true)
            .open(storage.path().join(format!("archive-{index}")))
            .unwrap()
    };

    std::thread::scope(|scope| {
        let workers = (0..4)
            .map(|index| {
                let file = make_output(index);
                let gate = &gate;
                scope.spawn(move || empty_archive(file.as_raw_fd(), Some(gate)))
            })
            .collect::<Vec<_>>();

        for _ in 0..4 {
            receiver.recv_timeout(Duration::from_secs(10)).unwrap();
        }
        let fifth = make_output(4);
        assert_eq!(
            empty_archive(fifth.as_raw_fd(), None)["error"],
            "E_INVALID_STATE"
        );
        assert_eq!(fifth.metadata().unwrap().len(), 0);

        *gate.release.lock().unwrap() = true;
        gate.changed.notify_all();
        for worker in workers {
            assert_eq!(worker.join().unwrap()["entryCount"], 0);
        }

        assert_eq!(empty_archive(fifth.as_raw_fd(), None)["entryCount"], 0);
        assert!(inspect(fifth).unwrap().entries.is_empty());
    });
}
