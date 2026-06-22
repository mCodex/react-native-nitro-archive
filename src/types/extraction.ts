import type { ExtractionDestination } from './archive'

export type OverwritePolicy = 'error' | 'skip' | 'replace' | 'rename'

export type DuplicateEntryPolicy = 'error' | 'first' | 'last'

export type SymlinkPolicy = 'reject' | 'materialize' | 'preserve-safe'

export interface ExtractionLimits {
  readonly maxEntries?: number
  readonly maxTotalUncompressedBytes?: bigint
  readonly maxEntryUncompressedBytes?: bigint
  readonly maxCompressionRatio?: number
  readonly maxPathDepth?: number
  readonly maxPathBytes?: number
}

export interface ExtractionSecurityPolicy {
  readonly preventPathTraversal?: true
  readonly rejectAbsolutePaths?: true
  readonly symlinks?: SymlinkPolicy
  readonly rejectSpecialFiles?: true
  readonly duplicates?: DuplicateEntryPolicy
}

export interface ExtractArchiveOptions {
  readonly destination: ExtractionDestination
  readonly entries?: readonly string[]
  readonly include?: readonly string[]
  readonly exclude?: readonly string[]
  readonly overwrite?: OverwritePolicy
  readonly limits?: ExtractionLimits
  readonly security?: ExtractionSecurityPolicy
  readonly preserveTimestamps?: boolean
  readonly preservePermissions?: boolean
  readonly preserveExecutableBit?: boolean
  readonly cleanupOnError?: boolean
  readonly cleanupOnCancel?: boolean
  readonly progressIntervalMs?: number
  readonly password?: string
}

export interface ArchiveWarning {
  readonly code: string
  readonly message: string
  readonly entryPath?: string
}

export interface ExtractionResult {
  readonly operationId: string
  readonly destination: ExtractionDestination
  readonly extractedEntries: number
  readonly skippedEntries: number
  readonly writtenBytes: bigint
  readonly durationMs: number
  readonly atomicWriteApplied: boolean
  readonly warnings: readonly ArchiveWarning[]
}
