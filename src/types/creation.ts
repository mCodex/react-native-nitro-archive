import type { ArchiveUriSource } from './archive'
import type { ArchiveWarning } from './extraction'
import type { ArchiveFileDestination } from './archive'

export type CompressionProfile = 'fastest' | 'balanced' | 'smallest'

export type ZipCompressionMethod = 'store' | 'deflate'

export type ZipEncryptionMethod =
  | 'none'
  | 'zip-crypto'
  | 'aes-128'
  | 'aes-256'

export interface CompressionOptions {
  readonly profile?: CompressionProfile
  readonly level?: number
  readonly storeAlreadyCompressed?: boolean
}

export interface EncryptionOptions {
  readonly method?: ZipEncryptionMethod
  readonly password?: string
}

export interface FileArchiveEntryInput {
  readonly kind: 'file'
  readonly sourcePath: string
  readonly archivePath: string
  readonly compressionMethod?: ZipCompressionMethod
}

export interface UriArchiveEntryInput {
  readonly kind: 'uri'
  readonly source: ArchiveUriSource
  readonly archivePath: string
  readonly compressionMethod?: ZipCompressionMethod
}

export interface DirectoryArchiveEntryInput {
  readonly kind: 'directory'
  readonly sourcePath: string
  readonly archivePath: string
  readonly recursive?: boolean
  readonly includeHidden?: boolean
  readonly include?: readonly string[]
  readonly exclude?: readonly string[]
  readonly followSymlinks?: boolean
}

export interface BufferArchiveEntryInput {
  readonly kind: 'buffer'
  readonly data: ArrayBuffer
  readonly archivePath: string
  readonly modifiedAt?: Date
  readonly compressionMethod?: ZipCompressionMethod
}

export type ArchiveEntryInput =
  | FileArchiveEntryInput
  | UriArchiveEntryInput
  | DirectoryArchiveEntryInput
  | BufferArchiveEntryInput

export interface CreateArchiveOptions {
  readonly destination: ArchiveFileDestination
  readonly entries: readonly ArchiveEntryInput[]
  readonly compression?: CompressionOptions
  readonly encryption?: EncryptionOptions
  readonly existingDestination?: 'error' | 'replace'
  readonly atomic?: boolean
  readonly includeEmptyDirectories?: boolean
  readonly preserveTimestamps?: boolean
  readonly maxInMemoryBytes?: bigint
  readonly progressIntervalMs?: number
}

export interface CreationResult {
  readonly operationId: string
  readonly output: ArchiveFileDestination
  readonly entryCount: number
  readonly inputBytes: bigint
  readonly outputBytes: bigint
  readonly durationMs: number
  readonly atomicWriteApplied: boolean
  readonly warnings: readonly ArchiveWarning[]
}
