import type { NativeOpenOutcome } from '../specs/ArchiveModule.nitro'
import type { NativeArchiveReader } from '../specs/NativeArchiveReader.nitro'
import { ArchiveError } from '../errors'

export { mapEntry, mapEntryPage, mapEntryInput } from './mappers/entryMapper'
export { mapProgress } from './mappers/progressMapper'
export {
  mapExtractionResult,
  mapCreationResult,
  mapValidationResult,
  mapWarning,
  mapIssue,
} from './mappers/resultMapper'
export {
  mapExtractionOptions,
  mapCreationOptions,
  mapValidationOptions,
  mapOpenOptions,
} from './mappers/optionsMapper'
export {
  mapCapabilities,
  mapDetection,
  mapAccessReport,
} from './mappers/capabilityMapper'

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
