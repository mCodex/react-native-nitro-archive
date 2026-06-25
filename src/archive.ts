import type { ArchiveSource } from './types/archive'
import type { ArchiveReader } from './public/ArchiveReader'
import { getNativeArchiveModule } from './internal/getNativeModule'
import { ArchiveReaderWrapper } from './internal/ArchiveReaderWrapper'
import { openOutcomeOrThrow } from './internal/nativeAdapter'
import { mapOpenOptions } from './internal/nativeAdapter'

export async function openArchive(
  source: ArchiveSource,
  options?: {
    readonly password?: string
    readonly maxEntriesToIndex?: number
    readonly maxCentralDirectoryBytes?: bigint
  },
): Promise<ArchiveReader> {
  const module = getNativeArchiveModule()
  const opts = mapOpenOptions(
    options,
    source.kind === 'uri' ? { iosSecurityScope: source.iosSecurityScope } : undefined,
    source.kind === 'buffer' ? { name: source.name } : undefined,
  )

  switch (source.kind) {
    case 'file': {
      const outcome = await module.openFile(source.path, opts.path)
      return new ArchiveReaderWrapper(openOutcomeOrThrow(outcome))
    }
    case 'uri': {
      const outcome = await module.openUri(source.uri, opts.uri)
      return new ArchiveReaderWrapper(openOutcomeOrThrow(outcome))
    }
    case 'buffer': {
      const outcome = await module.openBuffer(source.data, opts.buffer)
      return new ArchiveReaderWrapper(openOutcomeOrThrow(outcome))
    }
    default:
      throw new TypeError(`Unknown source kind: ${(source as ArchiveSource).kind}`)
  }
}
