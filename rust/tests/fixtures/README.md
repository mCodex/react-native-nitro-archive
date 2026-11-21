# ZIP interoperability fixtures

These six archives were produced outside the Rust crate and total 1,321 bytes.
The Rust tests embed the original bytes so test runs need no fixture-generation
tools.

| Fixture | Producer | Contents |
| --- | --- | --- |
| `interop.zip` | CPython `zipfile` | Stored text, a directory entry, a UTF-8 filename, and Deflate text |
| `empty.zip` | CPython `zipfile` | Empty archive with a valid end-of-central-directory record |
| `zip64.zip` | CPython `zipfile` with `ZIP64_LIMIT = 0` | A small stored entry with ZIP64 metadata, end record, and locator |
| `zipcrypto.zip` | Info-ZIP `zip -X -0 -P archive-test-password` | Stored text with legacy ZipCrypto encryption and a public fixture password |
| `aes256-ae1.zip` and `aes256-ae2.zip` | libarchive `bsdtar --format zip --options zip:encryption=aes256 --passphrase archive-test-password` | Deflate data with WinZip AES-256 encryption, AE-1 and AE-2 variants, and data descriptors |

`cargo test --manifest-path rust/Cargo.toml --test zip_interop` exercises
these fixtures through the Rust API. The host tests cover portions of cases
`ZIP-001` (missing end record), `ZIP-003` (ZIP64 metadata),
`ZIP-005` (data descriptors),
`ZIP-006` (exact stored and Deflate reads with limits),
`ZIP-007` (CRC failure before a buffer is returned), `ZIP-009`
(AES-256 interoperability), `ZIP-010` (failed authentication),
`ZIP-011` (ZipCrypto password handling), `ZIP-014` (valid UTF-8),
`FFI-101` (null input with a nonzero length), and `FFI-106`
(releasing returned JSON with its owning allocator).
These checks provide host evidence. Platform integration and the remaining
scenarios for each case need separate coverage.
