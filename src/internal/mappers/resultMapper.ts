import type {
	NativeArchiveIssue,
	NativeCreationResult,
	NativeExtractionResult,
	NativeValidationResult,
	NativeWarning,
} from "../../specs/NativeArchiveTypes";
import type {
	ArchiveFileDestination,
	ExtractionDestination,
} from "../../types/archive";
import type { CreationResult } from "../../types/creation";
import type { ArchiveWarning, ExtractionResult } from "../../types/extraction";
import type { ArchiveIssue, ValidationResult } from "../../types/validation";

function mapWarning(native: NativeWarning): ArchiveWarning {
	return {
		code: native.code,
		message: native.message,
		entryPath: native.entryPath ?? undefined,
	};
}

function mapIssue(native: NativeArchiveIssue): ArchiveIssue {
	return {
		code: native.code,
		severity: native.severity as ArchiveIssue["severity"],
		message: native.message,
		entryPath: native.entryPath ?? undefined,
		entryIndex: native.entryIndex ?? undefined,
	};
}

export function mapExtractionResult(
	native: NativeExtractionResult,
	destination: ExtractionDestination,
): ExtractionResult {
	return {
		operationId: native.operationId,
		destination,
		extractedEntries: native.extractedEntries,
		skippedEntries: native.skippedEntries,
		writtenBytes: BigInt(native.writtenBytes),
		durationMs: native.durationMs,
		atomicWriteApplied: native.atomicWriteApplied,
		warnings: native.warnings.map(mapWarning),
	};
}

export function mapCreationResult(
	native: NativeCreationResult,
	output: ArchiveFileDestination,
): CreationResult {
	return {
		operationId: native.operationId,
		output,
		entryCount: native.entryCount,
		inputBytes: BigInt(native.inputBytes),
		outputBytes: BigInt(native.outputBytes),
		durationMs: native.durationMs,
		atomicWriteApplied: native.atomicWriteApplied,
		warnings: native.warnings.map(mapWarning),
	};
}

export function mapValidationResult(
	native: NativeValidationResult,
): ValidationResult {
	return {
		operationId: native.operationId,
		valid: native.valid,
		checkedEntries: native.checkedEntries,
		checkedUncompressedBytes: BigInt(native.checkedUncompressedBytes),
		encryptedEntries: native.encryptedEntries,
		durationMs: native.durationMs,
		issues: native.issues.map(mapIssue),
	};
}

export { mapIssue, mapWarning };
