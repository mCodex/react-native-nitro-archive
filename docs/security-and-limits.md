# Bound archive processing

ZIP files can contain traversal paths, links, duplicate outputs, forged sizes and compressed data that expands beyond available resources. Password protection does not remove those risks.

This package is pre-1.0. Default policies are part of the contract; the cross-platform conformance and race-resistance checks must pass before treating the implementation as ready for arbitrary untrusted archives.

| Extraction budget | Contract default |
| --- | --- |
| Entries | 10,000 |
| Total uncompressed bytes | 2,147,483,648n (2 GiB) |
| One entry’s uncompressed bytes | 536,870,912n (512 MiB) |
| Uncompressed/compressed ratio | 1,000 |
| Normalized path depth | 32 |
| Normalized path length | 1,024 UTF-8 bytes |

The contract rejects traversal, absolute paths and special files; these protections cannot be disabled. Symlinks and duplicate normalized paths default to rejection. `preserve-safe` is reserved until both platforms implement component-by-component, race-resistant checks. Do not offer it as an available extraction feature. The facade rejects materialize/preserve-safe links, first/last duplicate policies and permission/executable-bit preservation with TypeError until they are implemented.

Choose limits based on the files your app expects. Keep buffers small: creation’s in-memory input budget defaults to 16,777,216n bytes. Use file paths or URIs for large inputs. Byte counts are `bigint`. Configured native byte limits must be positive and no greater than `Number.MAX_SAFE_INTEGER`, because the current bridge uses numbers; larger values throw `TypeError`. Listing accepts integer page sizes from 1 through 2,000. Convert bigint values explicitly if serializing to JSON, which does not accept bigint directly.

Extraction defaults to an error when output already exists. Relaxing overwrite or cleanup policies affects user data. Keep a dedicated destination for untrusted input and handle failures before consuming partial output. A successful preflight or validation is not a reservation of access or disk capacity for later extraction.

Use task progress for UI feedback and cancellation for user control. Cancellation is cooperative; wait for the task’s promise to settle before reusing its resources. Work is process-bound and does not guarantee completion after app termination.

Expected domain failures use stable `ArchiveError.code` identifiers. Immediate constructor misuse can throw `TypeError`, and unexpected native faults may reject normally. Catch unknown errors and narrow with `isArchiveError`; never parse message text to decide recovery.

For a suspected vulnerability, follow [SECURITY.md](../SECURITY.md). Do not publish a working exploit or real document contents in a public issue.
