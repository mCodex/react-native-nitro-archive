import { ArchiveError } from '../errors'

export function assertNotDisposed(disposed: boolean, operationId?: string): void {
  if (disposed) {
    throw new ArchiveError('E_DISPOSED', 'This archive session has been disposed.', { operationId })
  }
}

export function assertValidState(
  condition: boolean,
  code: 'E_INVALID_STATE' | 'E_INVALID_ARGUMENT',
  message: string,
  details?: Record<string, string | undefined>,
): void {
  if (!condition) {
    throw new ArchiveError(code, message, details as any)
  }
}
