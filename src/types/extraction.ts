import type { ExtractionDestination } from "./archive";

/**
 * How extraction handles an existing output: fail, skip, replace, or choose another name.
 */
export type OverwritePolicy = "error" | "skip" | "replace" | "rename";

/**
 * Duplicate-entry policy identifiers. Only error is accepted until relaxed policies are implemented.
 */
export type DuplicateEntryPolicy = "error" | "first" | "last";

/**
 * Link policy identifiers. Only reject is accepted; materialize and preserve-safe throw TypeError until supported.
 */
export type SymlinkPolicy = "reject" | "materialize" | "preserve-safe";

/**
 * Resource budgets for archive processing. Byte limits must be positive bigint values no greater than Number.MAX_SAFE_INTEGER at the native bridge.
 */
export interface ExtractionLimits {
	/**
	 * Maximum entries considered by processing.
	 * @default 10000
	 */
	readonly maxEntries?: number;
	/**
	 * Maximum aggregate uncompressed output in bytes.
	 * @default 2147483648n
	 */
	readonly maxTotalUncompressedBytes?: bigint;
	/**
	 * Maximum uncompressed bytes for one entry.
	 * @default 536870912n
	 */
	readonly maxEntryUncompressedBytes?: bigint;
	/**
	 * Maximum ratio of uncompressed to compressed bytes.
	 * @default 1000
	 */
	readonly maxCompressionRatio?: number;
	/**
	 * Maximum number of normalized path components.
	 * @default 32
	 */
	readonly maxPathDepth?: number;
	/**
	 * Maximum normalized path length in UTF-8 bytes.
	 * @default 1024
	 */
	readonly maxPathBytes?: number;
}

/**
 * Extraction safety policy. Traversal, absolute-path and special-file rejection cannot be disabled.
 */
export interface ExtractionSecurityPolicy {
	/**
	 * Traversal rejection is mandatory and cannot be disabled.
	 */
	readonly preventPathTraversal?: true;
	/**
	 * Absolute archive paths are rejected and cannot be enabled.
	 */
	readonly rejectAbsolutePaths?: true;
	/**
	 * Only reject is accepted. Other link policies throw TypeError until implemented on both platforms.
	 * @default "reject"
	 */
	readonly symlinks?: SymlinkPolicy;
	/**
	 * Special filesystem entries are rejected and cannot be enabled.
	 */
	readonly rejectSpecialFiles?: true;
	/**
	 * Only error is accepted. first and last throw TypeError until implemented on both platforms.
	 * @default "error"
	 */
	readonly duplicates?: DuplicateEntryPolicy;
}

/**
 * Selection, output and resource policy for extraction.
 * @example
 * const task = archive.extract({
 *   destination: directoryDestination(outputPath),
 *   include: ["photos/*.jpg"],
 *   exclude: ["photos/.DS_Store"],
 * })
 */
export interface ExtractArchiveOptions {
	/**
	 * ZIP output file/document, or extraction output directory.
	 */
	readonly destination: ExtractionDestination;
	/**
	 * Exact normalized archive paths to extract. Cannot be combined with include.
	 */
	readonly entries?: readonly string[];
	/**
	 * Include glob patterns. Omit to include all entries before exclusions; cannot combine with exact extraction entries.
	 */
	readonly include?: readonly string[];
	/**
	 * Glob patterns excluded after inclusion is evaluated.
	 */
	readonly exclude?: readonly string[];
	/**
	 * Existing-output policy.
	 * @default "error"
	 */
	readonly overwrite?: OverwritePolicy;
	/**
	 * Resource budgets for this operation. Keep restrictive values for untrusted archives.
	 */
	readonly limits?: ExtractionLimits;
	/**
	 * Extraction safety policy. Always-on restrictions cannot be disabled.
	 */
	readonly security?: ExtractionSecurityPolicy;
	/**
	 * Requests preserving entry modification times.
	 * @default true
	 */
	readonly preserveTimestamps?: boolean;
	/**
	 * Permission preservation is unavailable. Setting true throws TypeError.
	 * @default false
	 */
	readonly preservePermissions?: boolean;
	/**
	 * Executable-bit preservation is unavailable. Setting true throws TypeError.
	 * @default false
	 */
	readonly preserveExecutableBit?: boolean;
	/**
	 * Requests removal of output created by this operation after failure.
	 * @default true
	 */
	readonly cleanupOnError?: boolean;
	/**
	 * Requests removal of output created by this operation after cancellation.
	 * @default true
	 */
	readonly cleanupOnCancel?: boolean;
	/**
	 * Requested minimum interval between progress snapshots, in milliseconds.
	 * @default 100
	 */
	readonly progressIntervalMs?: number;
	/**
	 * Password for this operation. Do not log it or include it in diagnostics.
	 */
	readonly password?: string;
}

/**
 * A nonfatal diagnostic attached to an operation result.
 */
export interface ArchiveWarning {
	/**
	 * Machine-readable diagnostic identifier.
	 */
	readonly code: string;
	/**
	 * Human-readable diagnostic; branch on code rather than parsing this text.
	 */
	readonly message: string;
	/**
	 * Normalized archive path associated with this diagnostic, when known.
	 */
	readonly entryPath?: string;
}

/**
 * Completed extraction summary. Counters describe the operation, not the directory’s previous contents.
 */
export interface ExtractionResult {
	/**
	 * Identifier of the native operation that produced this snapshot or result.
	 */
	readonly operationId: string;
	/**
	 * ZIP output file/document, or extraction output directory.
	 */
	readonly destination: ExtractionDestination;
	/**
	 * Number of entries extracted by this operation.
	 */
	readonly extractedEntries: number;
	/**
	 * Number of selected entries skipped by output policy.
	 */
	readonly skippedEntries: number;
	/**
	 * Uncompressed output bytes written by extraction.
	 */
	readonly writtenBytes: bigint;
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
