import type { ExtractionLimits } from "./extraction";

export type ArchiveIssueSeverity = "warning" | "error";

export interface ArchiveIssue {
	readonly code: string;
	readonly severity: ArchiveIssueSeverity;
	readonly message: string;
	readonly entryPath?: string;
	readonly entryIndex?: number;
}

export interface ValidateArchiveOptions {
	readonly verifyChecksums?: boolean;
	readonly scanAllEntries?: boolean;
	readonly limits?: ExtractionLimits;
	readonly password?: string;
	readonly progressIntervalMs?: number;
}

export interface ValidationResult {
	readonly operationId: string;
	readonly valid: boolean;
	readonly checkedEntries: number;
	readonly checkedUncompressedBytes: bigint;
	readonly encryptedEntries: number;
	readonly durationMs: number;
	readonly issues: readonly ArchiveIssue[];
}
