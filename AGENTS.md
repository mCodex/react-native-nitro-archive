# AGENTS.md

## Purpose and current status

This repository implements `react-native-nitro-archive`, a React Native library
for inspecting, validating, reading, creating and extracting archives through
Nitro Modules. Write source, comments, tests, JSDoc and project documentation
in English.

Rust owns format detection, structural inspection, entry integrity checks,
bounded reads, creation and extraction for ZIP/ZIP64, TAR and TAR.GZ. Swift
and Kotlin own Nitro integration, task lifecycle, filesystem publication and
platform document access. See `rust/README.md` for the tested scope and the V7
evidence still required for release.

## Public contract and integration

- TypeScript owns the public API. Preserve named exports, subpaths, stable error
  codes, recovery metadata, result shapes, units and task semantics. Make
  compatibility changes explicit. Keep the defaults, error codes, task
  transitions, path policy and glob cases in `contracts/` aligned with the
  public contract and shared conformance tests.
- Keep imports side-effect free. Instantiate the Nitro singleton lazily and
  perform archive work asynchronously. Use paths, URIs, descriptors and
  `ArrayBuffer` for binary I/O. An asynchronous task must own or safely retain
  its inputs before returning control to the host.
- Keep progress scoped to a single task and coalesced. Tasks are single-use,
  process-bound and cooperatively cancellable. Preserve deterministic terminal
  states and cleanup across cancellation, disposal and failures.
- Use structured errors across language boundaries. Preserve byte counts
  losslessly as Rust `u64` and public `bigint`. Reject out-of-range conversions
  before narrowing to `usize`, platform integers or JavaScript numbers.
- Edit specs and regenerate Nitrogen output when the bridge contract changes.
  Keep handwritten C++ limited to bridge and platform glue.
- Keep picker UI, permission prompts and permission persistence in the host
  app. Kotlin owns Android SAF and URI grant integration. Swift owns iOS
  security scopes and coordinated URL access. Report provider-dependent
  seekability, atomicity and access failures accurately.

## Rust architecture

- Put format-independent archive models, security policy, resource budgets and
  operation orchestration in Rust. Isolate format engines, codecs, crypto,
  storage and FFI behind narrow interfaces with concrete callers and tests.
  An ACL is an anti-corruption layer that translates third-party or platform
  behavior into the shared contract.
- Deliver ZIP/ZIP64, TAR and TAR.GZ incrementally. Detect formats from content
  and validate their structure before advertising support. Optional formats,
  codecs and scanners require their own conformance and resource evidence.
  Disabled capabilities must fail with structured errors.
- Prefer bounded, seekable reads for ZIP, sequential decoding for compressed
  TAR and bounded spooling for non-seekable sources. Use the same path,
  integrity, quota and staging policies regardless of the adapter.
- Keep archive payloads on the native worker. Hand the Rust extractor an empty
  private staging file descriptor. Duplicate borrowed descriptors in Rust and
  publish staged files only after integrity verification succeeds.
- Prefer a bounded sequential implementation as the measured baseline. Use a
  shared lazy Tokio runtime for job orchestration and bounded Rayon workers
  for CPU work only where measured comparisons demonstrate a benefit. Enforce
  per-operation and shared limits, backpressure, fairness and cancellation.
- Keep Swift/Kotlin as Nitro and OS access adapters once a Rust path replaces
  the corresponding legacy operation. Remove a legacy engine, dependency and
  build configuration only after its last caller is migrated and equivalent
  behavior passes real builds and tests on both platforms. Remove verified
  dead code as each slice lands.

## Ownership and FFI

- Prefer borrows and slices for synchronous work. Document the owner, lifetime
  and thread rules where work crosses callbacks, queues, workers or the ABI.
  Move or explicitly retain owned buffers across async boundaries. Use shared
  ownership only when multiple live owners need it.
- Use a versioned C ABI with opaque, validated handles. Check null/length
  pairs, alignment, integer bounds and handle validity before accessing inputs
  under the caller's pointer-validity contract. Keep matching allocation and
  release APIs and make disposal idempotent under concurrency.
- Keep `unsafe` at audited boundaries. Each block needs a `SAFETY` comment
  explaining provenance, lifetime, aliasing and thread guarantees. Contain
  unwinding at each ABI entry point as supported by the build. Release locks
  before callbacks or awaits.
- Use RAII for file descriptors, temporary storage, quota permits and task
  state. Clear Rust-owned secrets where feasible and avoid unnecessary copies.
  Host-owned memory follows the ownership rules of the host runtime.

## Security and resource limits

- Apply path normalization and reject traversal, absolute paths, unsafe links,
  special files and duplicate destinations by default. Revalidate final paths
  after format-specific metadata resolution. Prevent writes outside the
  authorized root, including through filesystem races.
- Enforce input, metadata, entry, expanded byte, compression, memory, disk and
  concurrency budgets before allocation and during streaming. Use checked
  arithmetic. Treat archive metadata as untrusted. Stop at actual limits even
  when headers declare smaller sizes.
- Stage output until the required validation and integrity checks pass.
  Authenticate encrypted content before releasing plaintext. Preserve
  supported password flows and typed password errors. Reject unsupported
  encryption explicitly and keep legacy crypto behind its documented policy.
- Keep structural validation, integrity verification and optional content
  scanning distinct. When an operation requires a scanner, an unavailable or
  inconclusive result must fail closed. Never execute archive payloads or
  log passwords, private paths, provider identifiers or document contents.
  Process locally by default.

## Migration and release gates

1. Record the existing TypeScript/Nitro, Android and iOS baseline, dependencies,
   interop results and known gaps before replacing native behavior.
2. Implement Rust changes in testable slices with a shared fixture corpus.
   Link each enabled ACL and applicable case ID in
   `docs/ACL_SECURITY_TEST_MANIFEST_V7.json` to an executable test and preserve
   evidence for each target and format.
3. Require unrounded executable line coverage of at least 90% for the Rust
   workspace, each enabled crate and ACL, each critical module, and owned
   TypeScript, Kotlin and Swift production code. Missing reports or scope
   mappings fail the release gate. Generated glue may be excluded with a
   documented reason. All applicable P0 cases must execute and pass. A
   disabled format needs negative tests and a disabled capability.
4. Run formatting, type checks, Rust lints, native debug and release builds,
   Nitro lifecycle and interoperability tests, and applicable property,
   concurrency, fuzz, Miri and sanitizer checks. Use real native storage and
   engines for native conformance. Verify Android 16 KiB page compatibility.
5. Verify the npm tarball in bare React Native and Expo development builds
   without requiring the consumer to install Rust. Check lockfiles, licenses,
   dependency advisories, artifact size by ABI, resource budgets and actual
   performance measurements. Report missing evidence explicitly.
6. Keep generated output deterministic. Confirm supported toolchains from
   their official sources when changing dependencies. Publish, merge or
   release only with explicit authorization.
