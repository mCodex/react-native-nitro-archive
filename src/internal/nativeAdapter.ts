import type {
  NativeArchiveEntry,
  NativeEntryPage,
  NativeProgress,
  NativeArchiveCapabilities,
  NativeDetectionOutcome,
  NativeAccessOutcome,
  NativeExtractionResult,
  NativeCreationResult,
  NativeValidationResult,
  NativeExtractionRequest,
  NativeCreationRequest,
  NativeEntryInput,
  NativeWarning,
  NativeArchiveIssue,
  NativePathOpenOptions,
  NativeUriOpenOptions,
  NativeBufferOpenOptions,
  NativeValidationRequest,
} from '../specs/NativeArchiveTypes.nitro'
import type { NativeOpenOutcome } from '../specs/ArchiveModule.nitro'
import type { NativeArchiveReader } from '../specs/NativeArchiveReader.nitro'
import type { ArchiveEntry, ArchiveEntryPage, ArchiveCapabilities, ArchiveFormatDetection, ArchiveFormat, ArchiveFileDestination, ExtractionDestination } from '../types/archive'
import type { ArchiveProgress } from '../types/task'
import type { ArchiveAccessReport } from '../types/access'
import type { ExtractionResult, ExtractArchiveOptions, ArchiveWarning } from '../types/extraction'
import type { CreationResult, CreateArchiveOptions, ArchiveEntryInput } from '../types/creation'
import type { ValidationResult, ArchiveIssue, ValidateArchiveOptions } from '../types/validation'
import { ArchiveError } from '../errors'

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

export function mapEntry(native: NativeArchiveEntry): ArchiveEntry {
  return {
    index: native.index,
    path: native.path,
    name: native.name,
    parentPath: native.parentPath,
    kind: native.kind as ArchiveEntry['kind'],
    compressedSize: BigInt(native.compressedSize),
    uncompressedSize: BigInt(native.uncompressedSize),
    encrypted: native.encrypted,
    compressionMethod: native.compressionMethod as ArchiveEntry['compressionMethod'],
    modifiedAt: native.modifiedAt != null ? new Date(native.modifiedAt) : undefined,
    crc32: native.crc32 ?? undefined,
    unixMode: native.unixMode ?? undefined,
  }
}

export function mapEntryPage(native: NativeEntryPage): ArchiveEntryPage {
  return {
    entries: native.entries.map(mapEntry),
    offset: native.offset,
    nextOffset: native.nextOffset ?? undefined,
    totalEntries: native.totalEntries,
  }
}

export function mapProgress(native: NativeProgress): ArchiveProgress {
  return {
    operationId: native.operationId,
    phase: native.phase as ArchiveProgress['phase'],
    processedBytes: BigInt(native.processedBytes),
    totalBytes: native.totalBytes != null ? BigInt(native.totalBytes) : undefined,
    processedEntries: native.processedEntries,
    totalEntries: native.totalEntries ?? undefined,
    currentEntry: native.currentEntry ?? undefined,
    bytesPerSecond: native.bytesPerSecond ?? undefined,
    estimatedSecondsRemaining: native.estimatedSecondsRemaining ?? undefined,
    percentage: native.percentage ?? undefined,
  }
}

export function mapCapabilities(native: NativeArchiveCapabilities): ArchiveCapabilities {
  return {
    platform: native.platform as 'ios' | 'android',
    readableFormats: native.readableFormats as readonly ArchiveFormat[],
    writableFormats: native.writableFormats as readonly ArchiveFormat[],
    compressionMethods: native.compressionMethods,
    encryptionMethods: native.encryptionMethods,
    supportsFilePaths: true as const,
    supportsInputUris: native.supportsInputUris,
    supportsOutputUris: native.supportsOutputUris,
    supportsDirectoryUris: native.supportsDirectoryUris,
    supportsAtomicPathWrites: native.supportsAtomicPathWrites,
    supportsSecurityScopedUrls: native.supportsSecurityScopedUrls,
    supportsZip64: native.supportsZip64,
  }
}

export function mapDetection(native: NativeDetectionOutcome): ArchiveFormatDetection {
  if (!native.ok) {
    throw new ArchiveError(
      native.error?.code ?? 'E_INTERNAL',
      native.error?.message ?? 'Archive detection failed',
    )
  }
  return {
    format: native.format as ArchiveFormat | undefined,
    confidence: native.confidence,
    extensionMatches: native.extensionMatches ?? undefined,
  }
}

export function mapAccessReport(native: NativeAccessOutcome, mode: import('../types/access').ArchiveAccessMode): ArchiveAccessReport {
  return {
    platform: native.ok ? ('ios' as const) : ('android' as const),
    mode,
    accessible: native.accessible,
    readable: native.readable,
    writable: native.writable,
    persistent: native.persistent,
    securityScoped: native.securityScoped,
    providerBacked: native.providerBacked,
    seekable: native.seekable ?? undefined,
    requiredManifestPermissions: [],
    recoveryAction: (native.recoveryAction ?? 'none') as ArchiveAccessReport['recoveryAction'],
    reason: native.reason ?? undefined,
  }
}

export function openOutcomeOrThrow(native: NativeOpenOutcome): NativeArchiveReader {
  if (native.ok && native.reader) {
    return native.reader
  }
  throw new ArchiveError(
    native.error?.code ?? 'E_INTERNAL',
    native.error?.message ?? 'Failed to open archive',
    {
      operationId: native.error?.operationId,
      entryPath: native.error?.entryPath,
      source: native.error?.source,
      destination: native.error?.destination,
      nativeCode: native.error?.nativeCode,
    },
  )
}

export function mapExtractionOptions(options: ExtractArchiveOptions): NativeExtractionRequest {
  const dest = options.destination
  const native: NativeExtractionRequest = {
    destinationKind: dest.kind,
    entries: options.entries,
    include: options.include,
    exclude: options.exclude,
    overwrite: options.overwrite,
    preserveTimestamps: options.preserveTimestamps,
    cleanupOnError: options.cleanupOnError,
    cleanupOnCancel: options.cleanupOnCancel,
    progressIntervalMs: options.progressIntervalMs,
    password: options.password,
  }

  if (dest.kind === 'directory') {
    native.destinationPath = dest.path
  } else if (dest.kind === 'directory-uri') {
    native.destinationUri = dest.uri
  }

  if (options.limits) {
    native.limits = {
      maxEntries: options.limits.maxEntries,
      maxTotalUncompressedBytes: options.limits.maxTotalUncompressedBytes,
      maxEntryUncompressedBytes: options.limits.maxEntryUncompressedBytes,
      maxCompressionRatio: options.limits.maxCompressionRatio,
      maxPathDepth: options.limits.maxPathDepth,
      maxPathBytes: options.limits.maxPathBytes,
    }
  }

  return native
}

function mapEntryInput(entry: ArchiveEntryInput): NativeEntryInput {
  switch (entry.kind) {
    case 'file':
      return {
        kind: 'file',
        sourcePath: entry.sourcePath,
        archivePath: entry.archivePath,
        compressionMethod: entry.compressionMethod,
      }
    case 'uri':
      return {
        kind: 'uri',
        sourceUri: entry.source.uri,
        archivePath: entry.archivePath,
        compressionMethod: entry.compressionMethod,
      }
    case 'directory':
      return {
        kind: 'directory',
        sourcePath: entry.sourcePath,
        archivePath: entry.archivePath,
        recursive: entry.recursive,
        includeHidden: entry.includeHidden,
        followSymlinks: entry.followSymlinks,
      }
    case 'buffer':
      return {
        kind: 'buffer',
        data: entry.data,
        archivePath: entry.archivePath,
        modifiedAt: entry.modifiedAt != null ? entry.modifiedAt.getTime() : undefined,
        compressionMethod: entry.compressionMethod,
      }
    default:
      throw new ArchiveError('E_INVALID_ARGUMENT', `Unknown entry kind: ${(entry as ArchiveEntryInput).kind}`)
  }
}

export function mapCreationOptions(options: CreateArchiveOptions): NativeCreationRequest {
  const dest = options.destination
  const native: NativeCreationRequest = {
    destinationKind: dest.kind,
    entries: options.entries.map(mapEntryInput),
    storeAlreadyCompressed: options.compression?.storeAlreadyCompressed,
    compressionProfile: options.compression?.profile,
    compressionLevel: options.compression?.level,
    existingDestination: options.existingDestination,
    atomic: options.atomic,
    includeEmptyDirectories: options.includeEmptyDirectories,
    preserveTimestamps: options.preserveTimestamps,
    maxInMemoryBytes: options.maxInMemoryBytes,
    progressIntervalMs: options.progressIntervalMs,
  }

  if (dest.kind === 'file') {
    native.destinationPath = dest.path
  } else if (dest.kind === 'uri') {
    native.destinationUri = dest.uri
  }

  return native
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

export function mapValidationOptions(options: ValidateArchiveOptions): NativeValidationRequest {
  return {
    verifyChecksums: options.verifyChecksums,
    scanAllEntries: options.scanAllEntries,
    password: options.password,
    progressIntervalMs: options.progressIntervalMs,
  }
}

export function mapOpenOptions(
  options?: {
    readonly password?: string
    readonly maxEntriesToIndex?: number
    readonly maxCentralDirectoryBytes?: bigint
  },
  uriOptions?: { iosSecurityScope?: 'auto' | 'required' | 'disabled' },
): { path: NativePathOpenOptions; uri: NativeUriOpenOptions; buffer: NativeBufferOpenOptions } {
  const base = {
    password: options?.password,
    maxEntriesToIndex: options?.maxEntriesToIndex,
    maxCentralDirectoryBytes: options?.maxCentralDirectoryBytes,
    iosSecurityScope: uriOptions?.iosSecurityScope,
  }
  return {
    path: {
      password: base.password,
      maxEntriesToIndex: base.maxEntriesToIndex,
      maxCentralDirectoryBytes: base.maxCentralDirectoryBytes,
    },
    uri: {
      password: base.password,
      maxEntriesToIndex: base.maxEntriesToIndex,
      maxCentralDirectoryBytes: base.maxCentralDirectoryBytes,
      iosSecurityScope: base.iosSecurityScope,
    },
    buffer: {
      password: base.password,
      maxEntriesToIndex: base.maxEntriesToIndex,
      maxCentralDirectoryBytes: base.maxCentralDirectoryBytes,
    },
  }
}
