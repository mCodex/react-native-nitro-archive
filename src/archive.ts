import type { ArchiveSource } from './types/archive'
import type { ArchiveReader } from './public/ArchiveReader'
import { getNativeArchiveModule } from './internal/getNativeModule'
import { ArchiveReaderWrapper } from './internal/ArchiveReaderWrapper'
import { openOutcomeOrThrow } from './internal/nativeAdapter'

export async function openArchive(
  source: ArchiveSource,
  options?: {
    readonly password?: string
    readonly maxEntriesToIndex?: number
    readonly maxCentralDirectoryBytes?: bigint
  },
): Promise<ArchiveReader> {
  const module = getNativeArchiveModule()

  const nativeOpts = {
    password: options?.password,
    maxEntriesToIndex: options?.maxEntriesToIndex,
    maxCentralDirectoryBytes: options?.maxCentralDirectoryBytes,
  }

  switch (source.kind) {
    case 'file': {
      const outcome = await module.openFile(source.path, nativeOpts)
      return new ArchiveReaderWrapper(openOutcomeOrThrow(outcome))
    }
    case 'uri': {
      const outcome = await module.openUri(source.uri, {
        ...nativeOpts,
        iosSecurityScope: source.iosSecurityScope,
      })
      return new ArchiveReaderWrapper(openOutcomeOrThrow(outcome))
    }
    case 'buffer': {
      const outcome = await module.openBuffer(source.data, {
        ...nativeOpts,
        name: source.name,
      })
      return new ArchiveReaderWrapper(openOutcomeOrThrow(outcome))
    }
    default:
      throw new TypeError(`Unknown source kind: ${(source as ArchiveSource).kind}`)
  }
}
