export type ArchiveFormat = 'zip'

export interface ArchiveFormatDetection {
  readonly format?: ArchiveFormat
  readonly confidence: number
  readonly extensionMatches?: boolean
}

export type ArchiveEntryKind =
  | 'file'
  | 'directory'
  | 'symlink'
  | 'special'
  | 'unknown'

export type EntryCompressionMethod =
  | 'store'
  | 'deflate'
  | 'bzip2'
  | 'lzma'
  | 'zstd'
  | 'unknown'

export interface ArchiveEntry {
  readonly index: number
  readonly path: string
  readonly name: string
  readonly parentPath: string
  readonly kind: ArchiveEntryKind
  readonly compressedSize: bigint
  readonly uncompressedSize: bigint
  readonly encrypted: boolean
  readonly compressionMethod: EntryCompressionMethod
  readonly modifiedAt?: Date
  readonly crc32?: number
  readonly unixMode?: number
}

export interface ListArchiveEntriesOptions {
  readonly offset?: number
  readonly limit?: number
  readonly prefix?: string
  readonly kinds?: readonly ArchiveEntryKind[]
}

export interface ArchiveEntryPage {
  readonly entries: readonly ArchiveEntry[]
  readonly offset: number
  readonly nextOffset?: number
  readonly totalEntries: number
}

export interface ArchiveFileSource {
  readonly kind: 'file'
  readonly path: string
}

export interface ArchiveUriSource {
  readonly kind: 'uri'
  readonly uri: string
  readonly iosSecurityScope?: 'auto' | 'required' | 'disabled'
}

export interface ArchiveBufferSource {
  readonly kind: 'buffer'
  readonly data: ArrayBuffer
  readonly name?: string
}

export type ArchiveSource =
  | ArchiveFileSource
  | ArchiveUriSource
  | ArchiveBufferSource

export interface ArchivePathDestination {
  readonly kind: 'file'
  readonly path: string
}

export interface ArchiveUriDestination {
  readonly kind: 'uri'
  readonly uri: string
  readonly iosSecurityScope?: 'auto' | 'required' | 'disabled'
}

export type ArchiveFileDestination = ArchivePathDestination | ArchiveUriDestination

export interface DirectoryPathDestination {
  readonly kind: 'directory'
  readonly path: string
}

export interface DirectoryUriDestination {
  readonly kind: 'directory-uri'
  readonly uri: string
  readonly iosSecurityScope?: 'auto' | 'required' | 'disabled'
}

export type ExtractionDestination = DirectoryPathDestination | DirectoryUriDestination

export interface ArchiveCapabilities {
  readonly platform: 'ios' | 'android'
  readonly readableFormats: readonly ArchiveFormat[]
  readonly writableFormats: readonly ArchiveFormat[]
  readonly compressionMethods: readonly string[]
  readonly encryptionMethods: readonly string[]
  readonly supportsFilePaths: true
  readonly supportsInputUris: boolean
  readonly supportsOutputUris: boolean
  readonly supportsDirectoryUris: boolean
  readonly supportsAtomicPathWrites: boolean
  readonly supportsSecurityScopedUrls: boolean
  readonly supportsZip64: boolean
}
