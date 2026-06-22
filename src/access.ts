import type { ArchiveAccessReport, ArchiveAccessMode } from './types/access'
import type { ArchiveFileDestination, ArchiveSource, ExtractionDestination } from './types/archive'
import { getNativeArchiveModule } from './internal/getNativeModule'
import { mapAccessReport } from './internal/nativeAdapter'

function targetKind(target: ArchiveSource | ArchiveFileDestination | ExtractionDestination): string {
  return typeof target === 'object' && target !== null && 'kind' in target
    ? (target as { kind: string }).kind
    : 'buffer'
}

export async function checkArchiveAccess(
  target: ArchiveSource | ArchiveFileDestination | ExtractionDestination,
  mode: ArchiveAccessMode,
): Promise<ArchiveAccessReport> {
  const module = getNativeArchiveModule()

  const kind = targetKind(target)

  switch (kind) {
    case 'file': {
      const path = (target as any).path as string
      const result = await module.checkFileAccess(path, mode)
      return mapAccessReport(result, mode)
    }
    case 'uri':
    case 'directory-uri': {
      const uri = (target as any).uri as string
      const result = await module.checkUriAccess(uri, mode)
      return mapAccessReport(result, mode)
    }
    case 'buffer':
      return {
        platform: 'ios' as const,
        mode,
        accessible: true,
        readable: true,
        writable: true,
        persistent: true,
        securityScoped: false,
        providerBacked: false,
        requiredManifestPermissions: [],
        recoveryAction: 'none' as const,
      }
    default:
      throw new TypeError(`Unknown target kind: ${kind}`)
  }
}
