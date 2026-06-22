import { ArchiveError } from '../errors'

export interface NativeOutcome<T> {
  value?: T
  error?: { code: string; message: string }
}

export function unwrapOutcome<T>(outcome: NativeOutcome<T>): T {
  if (outcome.error) {
    throw new ArchiveError(
      outcome.error.code as any,
      outcome.error.message,
    )
  }
  if (outcome.value === undefined) {
    throw new ArchiveError('E_INTERNAL', 'Malformed native outcome: missing value and error')
  }
  return outcome.value
}
