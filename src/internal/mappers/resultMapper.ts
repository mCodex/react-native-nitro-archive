import type {
  NativeExtractionResult,
  NativeCreationResult,
  NativeValidationResult,
  NativeWarning,
  NativeArchiveIssue,
} from '../../specs/NativeArchiveTypes'
import type {
  ExtractionResult,
  ArchiveWarning,
} from '../../types/extraction'
import type { CreationResult } from '../../types/creation'
import type { ValidationResult, ArchiveIssue } from '../../types/validation'
import type {
  ArchiveFileDestination,
  ExtractionDestination,
} from '../../types/archive'

function mapWarning(native: NativeWarning): ArchiveWarning {
  return {
    code: native.code,
    message: native.message,
    entryPath: native.entryPath ?? undefined,
  }
}

function mapIssue(native: NativeArchiveIssue): ArchiveIssue {
  return {
    code: native.code,
    severity: native.severity as ArchiveIssue['severity'],
    message: native.message,
    entryPath: native.entryPath ?? undefined,
    entryIndex: native.entryIndex ?? undefined,
  }
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
  }
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
  }
}

export function mapValidationResult(native: NativeValidationResult): ValidationResult {
  return {
    operationId: native.operationId,
    valid: native.valid,
    checkedEntries: native.checkedEntries,
    checkedUncompressedBytes: BigInt(native.checkedUncompressedBytes),
    encryptedEntries: native.encryptedEntries,
    durationMs: native.durationMs,
    issues: native.issues.map(mapIssue),
  }
}

export { mapWarning, mapIssue }
