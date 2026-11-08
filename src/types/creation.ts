import type { ArchiveFileDestination, ArchiveUriSource } from "./archive";
import type { ArchiveWarning } from "./extraction";

/**
 * Compression preference. The contract maps fastest/balanced/smallest to levels 1/6/9.
 */
export type CompressionProfile = "fastest" | "balanced" | "smallest";

/**
 * Compression methods available when creating ZIP entries.
 */
export type ZipCompressionMethod = "store" | "deflate";

/**
 * ZIP encryption identifiers. An identifier in this type is not a platform support guarantee.
 */
export type ZipEncryptionMethod = "none" | "zip-crypto" | "aes-128" | "aes-256";

/**
 * ZIP compression policy. Check native capabilities when selecting entry methods.
 */
export interface CompressionOptions {
	/**
	 * Compression preference.
	 * @default "balanced"
	 */
	readonly profile?: CompressionProfile;
	/**
	 * Deflate compression level from 0 to 9; overrides the profile mapping when supported.
	 */
	readonly level?: number;
	/**
	 * Requests store for recognized already-compressed extensions.
	 * @default true
	 */
	readonly storeAlreadyCompressed?: boolean;
}

/**
 * Optional ZIP encryption settings. Check advertised methods and interoperability before use.
 */
export interface EncryptionOptions {
	/**
	 * ZIP encryption method for newly created archives.
	 *
	 * Creation currently accepts `zip-crypto` and `aes-256` when the active
	 * platform reports them through capabilities. `aes-128` remains in the
	 * shared type for encrypted ZIP read/extract interoperability.
	 */
	readonly method?: ZipEncryptionMethod;
	/**
	 * Password used to encrypt the ZIP entries.
	 *
	 * Passwords are passed only to the current native operation and must not be
	 * logged, cached globally, or emitted in progress/error payloads.
	 */
	readonly password?: string;
}

/**
 * A local file to include in a ZIP. Prefer fileEntry() to construct this value.
 */
export interface FileArchiveEntryInput {
	/**
	 * Discriminant identifying the entry, source or destination representation.
	 */
	readonly kind: "file";
	/**
	 * Absolute native input path without a file:// prefix.
	 */
	readonly sourcePath: string;
	/**
	 * Relative forward-slash output path inside the ZIP; native path safety checks still apply.
	 */
	readonly archivePath: string;
	/**
	 * Compression method for this entry. Metadata recognition does not establish support.
	 */
	readonly compressionMethod?: ZipCompressionMethod;
}

/**
 * A file read through a platform URI. Access grants remain the host app’s responsibility.
 */
export interface UriArchiveEntryInput {
	/**
	 * Discriminant identifying the entry, source or destination representation.
	 */
	readonly kind: "uri";
	/**
	 * Platform URI input, including any iOS security-scope preference.
	 */
	readonly source: ArchiveUriSource;
	/**
	 * Relative forward-slash output path inside the ZIP; native path safety checks still apply.
	 */
	readonly archivePath: string;
	/**
	 * Compression method for this entry. Metadata recognition does not establish support.
	 */
	readonly compressionMethod?: ZipCompressionMethod;
}

/**
 * A local directory to traverse for creation. Prefer directoryEntry() for constructor defaults.
 */
export interface DirectoryArchiveEntryInput {
	/**
	 * Discriminant identifying the entry, source or destination representation.
	 */
	readonly kind: "directory";
	/**
	 * Absolute native input path without a file:// prefix.
	 */
	readonly sourcePath: string;
	/**
	 * Relative forward-slash output path inside the ZIP; native path safety checks still apply.
	 */
	readonly archivePath: string;
	/**
	 * Includes child directories during traversal.
	 * @default true
	 */
	readonly recursive?: boolean;
	/**
	 * Includes hidden filesystem entries during traversal.
	 * @default false
	 */
	readonly includeHidden?: boolean;
	/**
	 * Include glob patterns. Omit to include all entries before exclusions; cannot combine with exact extraction entries.
	 */
	readonly include?: readonly string[];
	/**
	 * Glob patterns excluded after inclusion is evaluated.
	 */
	readonly exclude?: readonly string[];
	/**
	 * Requests following filesystem links during creation. Enable only for inputs you control.
	 * @default false
	 */
	readonly followSymlinks?: boolean;
}

/**
 * A small in-memory ZIP entry. Prefer bufferEntry() and bound aggregate memory usage.
 */
export interface BufferArchiveEntryInput {
	/**
	 * Discriminant identifying the entry, source or destination representation.
	 */
	readonly kind: "buffer";
	/**
	 * Binary data as an ArrayBuffer. Intended for bounded in-memory inputs, without base64.
	 */
	readonly data: ArrayBuffer;
	/**
	 * Relative forward-slash output path inside the ZIP; native path safety checks still apply.
	 */
	readonly archivePath: string;
	/**
	 * Modification timestamp, when supplied or available in metadata.
	 */
	readonly modifiedAt?: Date;
	/**
	 * Compression method for this entry. Metadata recognition does not establish support.
	 */
	readonly compressionMethod?: ZipCompressionMethod;
}

/**
 * One source of ZIP contents, with its intended relative archive path.
 */
export type ArchiveEntryInput =
	| FileArchiveEntryInput
	| UriArchiveEntryInput
	| DirectoryArchiveEntryInput
	| BufferArchiveEntryInput;

/**
 * Inputs and output policy for a single ZIP creation task.
 * @remarks
 * Creating the task does not start it. Call start() once and dispose() when finished.
 */
export interface CreateArchiveOptions {
	/**
	 * ZIP output file/document, or extraction output directory.
	 */
	readonly destination: ArchiveFileDestination;
	/**
	 * Files, directories, URI documents or buffers to include in the ZIP.
	 */
	readonly entries: readonly ArchiveEntryInput[];
	/**
	 * Optional ZIP compression policy.
	 */
	readonly compression?: CompressionOptions;
	/**
	 * Optional encryption policy. Check capabilities and cross-platform interoperability before use.
	 */
	readonly encryption?: EncryptionOptions;
	/**
	 * Policy for a ZIP output that already exists.
	 * @default "error"
	 */
	readonly existingDestination?: "error" | "replace";
	/**
	 * Requests atomic creation where supported. Consult atomicWriteApplied in the result.
	 * @default true
	 */
	readonly atomic?: boolean;
	/**
	 * Requests inclusion of empty source directories.
	 * @default true
	 */
	readonly includeEmptyDirectories?: boolean;
	/**
	 * Requests preserving entry modification times.
	 * @default true
	 */
	readonly preserveTimestamps?: boolean;
	/**
	 * Aggregate in-memory input budget in bytes; must be positive and no greater than Number.MAX_SAFE_INTEGER.
	 * @default 16777216n
	 */
	readonly maxInMemoryBytes?: bigint;
	/**
	 * Requested minimum interval between progress snapshots, in milliseconds.
	 * @default 100
	 */
	readonly progressIntervalMs?: number;
}

/**
 * Completed ZIP creation. Consult atomicWriteApplied and warnings for the actual output guarantees.
 */
export interface CreationResult {
	/**
	 * Identifier of the native operation that produced this snapshot or result.
	 */
	readonly operationId: string;
	/**
	 * Destination of the created ZIP.
	 */
	readonly output: ArchiveFileDestination;
	/**
	 * Number of entries in the archive or created output.
	 */
	readonly entryCount: number;
	/**
	 * Input bytes consumed during creation.
	 */
	readonly inputBytes: bigint;
	/**
	 * Size of the created ZIP in bytes.
	 */
	readonly outputBytes: bigint;
	/**
	 * Elapsed operation duration in milliseconds.
	 */
	readonly durationMs: number;
	/**
	 * Whether this operation actually used atomic output replacement; do not infer it from requested options.
	 */
	readonly atomicWriteApplied: boolean;
	/**
	 * Nonfatal diagnostics emitted during the operation.
	 */
	readonly warnings: readonly ArchiveWarning[];
}
