import type { ExtractionLimits } from "./extraction";

/**
 * Validation diagnostic severity. An error indicates invalid or unsupported archive content.
 */
export type ArchiveIssueSeverity = "warning" | "error";

/**
 * Validation finding with optional entry context.
 */
export interface ArchiveIssue {
	/**
	 * Machine-readable diagnostic identifier.
	 */
	readonly code: string;
	/**
	 * Severity of this validation finding.
	 */
	readonly severity: ArchiveIssueSeverity;
	/**
	 * Human-readable diagnostic; branch on code rather than parsing this text.
	 */
	readonly message: string;
	/**
	 * Normalized archive path associated with this diagnostic, when known.
	 */
	readonly entryPath?: string;
	/**
	 * Zero-based entry index associated with this issue, when known.
	 */
	readonly entryIndex?: number;
}

/**
 * Content checks and resource policy for a validation task.
 */
export interface ValidateArchiveOptions {
	/**
	 * Verifies entry CRC checksums when validating content.
	 * @default true
	 */
	readonly verifyChecksums?: boolean;
	/**
	 * Continues scanning entries to collect findings.
	 * @default true
	 */
	readonly scanAllEntries?: boolean;
	/**
	 * Resource budgets for this operation. Keep restrictive values for untrusted archives.
	 */
	readonly limits?: ExtractionLimits;
	/**
	 * Password for this operation. Do not log it or include it in diagnostics.
	 */
	readonly password?: string;
	/**
	 * Requested minimum interval between progress snapshots, in milliseconds.
	 * @default 100
	 */
	readonly progressIntervalMs?: number;
}

/**
 * Validation summary. Check valid and inspect issues before deciding how to handle the archive.
 */
export interface ValidationResult {
	/**
	 * Identifier of the native operation that produced this snapshot or result.
	 */
	readonly operationId: string;
	/**
	 * Whether validation completed without error-severity findings.
	 */
	readonly valid: boolean;
	/**
	 * Number of entries checked by validation.
	 */
	readonly checkedEntries: number;
	/**
	 * Uncompressed bytes checked during validation.
	 */
	readonly checkedUncompressedBytes: bigint;
	/**
	 * Number of encrypted entries encountered by validation.
	 */
	readonly encryptedEntries: number;
	/**
	 * Elapsed operation duration in milliseconds.
	 */
	readonly durationMs: number;
	/**
	 * Validation diagnostics, including optional entry context.
	 */
	readonly issues: readonly ArchiveIssue[];
}
