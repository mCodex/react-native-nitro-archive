# Rust archive core

`nitro-archive-core` handles format detection, inspection, entry integrity
checks, bounded reads, streaming creation and extraction for ZIP/ZIP64, TAR and
TAR.GZ. The TypeScript facade defines the public contract. Swift and Kotlin
manage Nitro tasks, OS permissions, document providers and filesystem
publication. Native workers call Rust through the versioned C ABI.

## Formats and integrity

- ZIP reads and writes Store and Deflate, supports ZIP64, and verifies CRC or
  WinZip AES authentication as applicable. AES-256 is available for encryption
  and ZipCrypto requires explicit selection for legacy interoperability.
- TAR and TAR.GZ support regular files and directories. TAR verifies header
  checksums. TAR.GZ also verifies the gzip stream trailer before publishing
  extracted data. TAR.GZ reports zero compressed bytes for individual entries
  because the gzip stream compresses the archive as a whole.
- Detection validates archive contents before reporting a match. Inspection
  bounds input and metadata, checks entry ranges, and rejects ambiguous paths.
  Extraction rejects links and special files and checks payload limits during
  streaming. Sparse TAR and split ZIP archives are unsupported.

## Native integration

Each extraction call writes one selected entry to a private staging descriptor
borrowed from the platform adapter. Rust duplicates the descriptor, checks its
initial state, and reads in bounded chunks. On success the adapter publishes the
verified file through the authorized destination. On failure or cancellation
the adapter removes staged output according to the task policy. Both adapters
return structured domain errors and reject loss of integer precision at the
Nitro boundary.

Runtime calls run off the JavaScript thread. Rust admits at most four concurrent
streaming operations. Each admitted call processes entries sequentially.
Selective ZIP extraction only decompresses selected files. TAR.GZ selection
still decodes the gzip stream to verify its trailer, so extracting several
entries can repeat work. Android stages an existing in-memory archive for
extraction. iOS uses a seekable session file. Buffer reads remain size bounded.

Local extraction uses descriptor-relative destination operations. Android
supports the local overwrite policies and writable document URIs for creation.
iOS extraction currently rejects existing files for all overwrite settings.
Directory URI extraction remains unsupported on both platforms.

## Maintainer builds

Use Rust 1.100.0, the checked-in lockfile, Xcode and Android NDK 27.1.12297006.

```sh
cargo test --manifest-path rust/Cargo.toml --locked
cargo clippy --manifest-path rust/Cargo.toml --locked --all-targets -- -D warnings

rustup component add llvm-tools
python3 rust/check-coverage.py
rustup target add aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios \
  aarch64-apple-tvos aarch64-apple-tvos-sim
bash rust/build-ios.sh

rustup target add aarch64-linux-android armv7-linux-androideabi \
  i686-linux-android x86_64-linux-android
sh rust/build-android.sh "$ANDROID_HOME/ndk/27.1.12297006"

npm pack
```

The npm package contains the Apple XCFramework, four Android static archives,
and the shared C header. CocoaPods and the Android NDK consume those binaries
without running Cargo. Prepack checks the binary slices, regenerates Nitrogen
bindings and builds TypeScript. Generated artifacts stay outside Git.

## Verification scope

The Rust suite ran 36 tests and covered 1,247 of 1,312 executable lines
(95.05%). Every production Rust file exceeded 90%. The TypeScript suite ran
165 tests and covered 259 of 273 executable lines (94.87%). See
[fixture coverage](tests/fixtures/README.md) for the mapped V7 test cases.

Native smoke tests exercised ZIP, TAR and TAR.GZ on an Android arm64 API 37
emulator with 16 KiB pages and on an iOS 27 arm64 simulator. Both also exercised
cancellation and destination safety. The Apple simulator app built in Debug and
Release. Android linked all four JNI ABIs with 16 KiB ELF alignment.

The full V7 release matrix still requires physical-device and document provider
testing, Kotlin and Swift line coverage, a package install in an Expo development
build, and throughput and memory measurements.
