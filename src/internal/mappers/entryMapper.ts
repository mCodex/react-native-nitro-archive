import type {
  NativeArchiveEntry,
  NativeEntryPage,
  NativeEntryInput,
} from '../../specs/NativeArchiveTypes'
import type {
  ArchiveEntry,
  ArchiveEntryPage,
} from '../../types/archive'
import type { ArchiveEntryInput } from '../../types/creation'
import { ArchiveError } from '../../errors'

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

export function mapEntryInput(entry: ArchiveEntryInput): NativeEntryInput {
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
