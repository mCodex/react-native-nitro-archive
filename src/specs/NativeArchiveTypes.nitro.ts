import type { UInt64 } from 'react-native-nitro-modules'
import type { ArchiveErrorCode } from '../errors'

export type NativePlatform = 'ios' | 'android'

export interface NativeArchiveCapabilities {
  platform: NativePlatform
  readableFormats: readonly string[]
  writableFormats: readonly string[]
  compressionMethods: readonly string[]
  encryptionMethods: readonly string[]
  supportsFilePaths: boolean
  supportsInputUris: boolean
  supportsOutputUris: boolean
  supportsDirectoryUris: boolean
  supportsAtomicPathWrites: boolean
  supportsSecurityScopedUrls: boolean
  supportsZip64: boolean
}

export interface NativeArchiveEntry {
  index: number
  path: string
  name: string
  parentPath: string
  kind: string
  compressedSize: UInt64
  uncompressedSize: UInt64
  encrypted: boolean
  compressionMethod: string
  modifiedAt?: number
  crc32?: number
  unixMode?: number
}

export interface NativeEntryPage {
  entries: readonly NativeArchiveEntry[]
  offset: number
  nextOffset?: number
  totalEntries: number
}

export interface NativeArchiveFailure {
  code: ArchiveErrorCode
  message: string
  operationId?: string
  entryPath?: string
  source?: string
  destination?: string
  nativeCode?: number
}

export interface NativeDetectionOutcome {
  ok: boolean
  format?: string
  confidence: number
  extensionMatches?: boolean
  error?: NativeArchiveFailure
}

export interface NativeAccessOutcome {
  ok: boolean
  accessible: boolean
  readable: boolean
  writable: boolean
  persistent: boolean
  securityScoped: boolean
  providerBacked: boolean
  seekable?: boolean
  reason?: string
  recoveryAction?: string
  error?: NativeArchiveFailure
}

export interface NativeProgress {
  operationId: string
  phase: string
  processedBytes: UInt64
  totalBytes?: UInt64
  processedEntries: number
  totalEntries?: number
  currentEntry?: string
  bytesPerSecond?: number
  estimatedSecondsRemaining?: number
  percentage?: number
}

export interface NativeExtractionResult {
  operationId: string
  extractedEntries: number
  skippedEntries: number
  writtenBytes: UInt64
  durationMs: number
  atomicWriteApplied: boolean
  warnings: readonly NativeWarning[]
}

export interface NativeCreationResult {
  operationId: string
  entryCount: number
  inputBytes: UInt64
  outputBytes: UInt64
  durationMs: number
  atomicWriteApplied: boolean
  warnings: readonly NativeWarning[]
}

export interface NativeValidationResult {
  operationId: string
  valid: boolean
  checkedEntries: number
  checkedUncompressedBytes: UInt64
  encryptedEntries: number
  durationMs: number
  issues: readonly NativeArchiveIssue[]
}

export interface NativeArchiveIssue {
  code: string
  severity: string
  message: string
  entryPath?: string
  entryIndex?: number
}

export interface NativeWarning {
  code: string
  message: string
  entryPath?: string
}

export interface NativePathOpenOptions {
  password?: string
  maxEntriesToIndex?: number
  maxCentralDirectoryBytes?: UInt64
}

export interface NativeUriOpenOptions {
  password?: string
  maxEntriesToIndex?: number
  maxCentralDirectoryBytes?: UInt64
  iosSecurityScope?: string
}

export interface NativeBufferOpenOptions {
  password?: string
  maxEntriesToIndex?: number
  maxCentralDirectoryBytes?: UInt64
  name?: string
}

export interface NativeExtractionRequest {
  destinationPath?: string
  destinationUri?: string
  destinationKind: string
  entries?: readonly string[]
  include?: readonly string[]
  exclude?: readonly string[]
  overwrite?: string
  limits?: NativeExtractionLimits
  preserveTimestamps?: boolean
  cleanupOnError?: boolean
  cleanupOnCancel?: boolean
  progressIntervalMs?: number
  password?: string
}

export interface NativeExtractionLimits {
  maxEntries?: number
  maxTotalUncompressedBytes?: UInt64
  maxEntryUncompressedBytes?: UInt64
  maxCompressionRatio?: number
  maxPathDepth?: number
  maxPathBytes?: number
}

export interface NativeCreationRequest {
  destinationPath?: string
  destinationUri?: string
  destinationKind: string
  entries: readonly NativeEntryInput[]
  compressionProfile?: string
  compressionLevel?: number
  storeAlreadyCompressed?: boolean
  existingDestination?: string
  atomic?: boolean
  includeEmptyDirectories?: boolean
  preserveTimestamps?: boolean
  maxInMemoryBytes?: UInt64
  progressIntervalMs?: number
}

export interface NativeEntryInput {
  kind: string
  sourcePath?: string
  sourceUri?: string
  archivePath: string
  data?: ArrayBuffer
  recursive?: boolean
  includeHidden?: boolean
  followSymlinks?: boolean
  modifiedAt?: number
  compressionMethod?: string
}

export interface NativeValidationRequest {
  verifyChecksums?: boolean
  scanAllEntries?: boolean
  password?: string
  progressIntervalMs?: number
}
