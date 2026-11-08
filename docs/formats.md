# Assess additional archive formats

Status: feasibility assessment, not implemented format support. The public `ArchiveFormat` remains `zip`. Completing secure ZIP/ZIP64 behavior on Android and iOS is the first release gate.

Additional formats need separate decisions for detection, listing, bounded reads, extraction, validation and creation. An engine recognizing a signature does not establish safe support for all of those operations.

| Format | Candidate scope | Questions before adoption |
| --- | --- | --- |
| TAR | Read/extract and create | PAX/GNU metadata, hardlinks, sparse entries, special files, encoding and size limits |
| TAR.GZ / TGZ | TAR wrapped in gzip | Streaming versus indexed access, bounded temporary storage, gzip integrity and limits across both layers |
| RAR | Evaluate reading/extraction only | Format versions, solid archives, multipart volumes, passwords, redistribution terms and engine maintenance |
| Other formats | No implementation commitment | Both-platform demand, maintained engines, licensing and binary-size budget |

TAR is an archive container; gzip compresses a stream. Listing or selecting entries in a TAR.GZ file can require reading preceding compressed content. The API must describe that cost rather than promise ZIP-like random access.

A native engine candidate must build for Android and iOS, obey cancellation and bounded-memory requirements, and pass the same path, link, duplicate-output and rollback corpus. Rules remain in Swift/Kotlin behind platform-local interfaces; no archive domain behavior goes into the Nitro bridge.

Potential engines must be assessed from their own documentation and release/license files. [libarchive](https://www.libarchive.org/) is a candidate for investigation; integration, exact format coverage, build footprint and license obligations are not approved by this document. Adding an engine solely on one platform would not establish public multiplatform support.

Before exposing a format:

1. Document exactly which operations and variants each platform implements.
2. Verify license and redistribution terms for the selected version and bundled dependencies.
3. Measure native binary growth, build cost, memory and temporary storage.
4. Test interoperability and malicious fixtures in both native implementations.
5. Update the TypeScript contract, capability reporting, docs and shared expected results together.

JavaScript tree-shaking does not make an added native engine optional. Keep ZIP as the only advertised format unless these gates pass; a separate release or package remains an option if the cost does not fit the ZIP library.
