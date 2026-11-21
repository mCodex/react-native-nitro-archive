# Rust ZIP core

## Runtime ownership

The public TypeScript facade and Nitrogen contract remain the entry points.
Swift and Kotlin dispatch ZIP inspection and bounded entry reads to
`nitro-archive-core` through a versioned C ABI. The Rust library also supports
seekable readers on the host. Zip4j and SSZipArchive/minizip continue to serve
creation and extraction.

iOS stages each open input in a private, session-owned file. Rust seeks through
that file for inspection and reads. The session deletes its directory on
release or on a failed open. Android retains the session's input bytes because
the remaining extraction operation still depends on them. It checks its
512 MiB input ceiling before reading or copying each source. Both clients
reject metadata byte counts that exceed JavaScript's safe integer range.

Native adapters borrow pointers only for the synchronous ABI call on an
existing worker. Rust owns every ABI result. The caller releases returned
JSON and entry buffers through the matching versioned functions. Swift can
transfer the entry buffer directly to a Foundation `Data` deallocator. JNI
copies bytes into a Java array after releasing the borrowed input arrays.

## ZIP policy

Inspection bounds the catalog to 10,000 entries and 16 MiB of central
directory data. It validates the ZIP or ZIP64 footer, local and central
headers, entry ranges and normalized paths. It rejects ambiguous normalized
paths, including file and directory names that differ only by a trailing
slash. Split archives, trailing data and optional ZIP64 extensible data
records fall outside the supported envelope.

Bounded reads select one entry and enforce both its declared and actual
output size. Store and Deflate are enabled. Rust returns buffered plaintext
after reading through CRC or WinZip AES authentication. ZipCrypto remains
available for legacy interoperability and provides no authentication.
Inspection only verifies archive structure and metadata.

Each read currently walks the bounded catalog. A retained Rust session index
will be needed before the validation path can verify many entries without
rechecking metadata. Kotlin and Swift still own permissions, task
cancellation and extraction storage.

## Maintainer builds

Use the pinned lockfile and Rust 1.100.0. Install the relevant targets and use
the repository's Xcode and Android NDK before building each platform.

```sh
cargo test --manifest-path rust/Cargo.toml --locked
cargo clippy --manifest-path rust/Cargo.toml --locked --all-targets -- -D warnings

rustup component add llvm-tools
rustup target add aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios \
  aarch64-apple-tvos aarch64-apple-tvos-sim
bash rust/build-ios.sh

rustup target add aarch64-linux-android armv7-linux-androideabi \
  i686-linux-android x86_64-linux-android
sh rust/build-android.sh "$ANDROID_HOME/ndk/27.1.12297006"

npm pack
```

The npm package contains the Apple XCFramework, the Android static archives
and the shared C header. CocoaPods and the Android NDK consume these artifacts
without invoking Cargo. The prepack script requires every supported binary
slice. Generated artifacts stay outside Git.

The host fixtures in `rust/tests/fixtures` exercise
ZIP64, stored and Deflate payloads, CRC, ZipCrypto and WinZip AES. The existing
release requirements also cover native device conformance, coverage per layer
and scenario evidence. TAR, TAR.GZ, Rust creation and Rust extraction remain
future migration steps.

## Verification

The host suite passed 14 tests. LLVM measured 480 of 515 executable lines
covered across the core. The FFI, footer and ZIP implementation measured
98.46%, 91.85% and 91.20%, respectively. These figures cover host Rust code.

The arm64 Android example release APK passed R8 and 16 KiB ZIP and ELF
alignment checks. The Rust JNI bridge linked for all four Android ABIs.
The iOS example release build linked the final XCFramework for both
simulator architectures. Minimal ABI linkage also passed for the iOS and
tvOS device slices and the tvOS simulator slice.
