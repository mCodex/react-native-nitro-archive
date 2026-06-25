import { ArchiveError, isArchiveError } from '../src/errors'

describe('ArchiveError', () => {
  it('constructs with code and message', () => {
    const error = new ArchiveError('E_INTERNAL', 'Something went wrong')
    expect(error).toBeInstanceOf(ArchiveError)
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('ArchiveError')
    expect(error.code).toBe('E_INTERNAL')
    expect(error.message).toBe('Something went wrong')
    expect(error.details).toEqual({})
    expect(error.cause).toBeUndefined()
  })

  it('constructs with all parameters', () => {
    const details = {
      operationId: 'op-123',
      entryPath: 'file.txt',
      source: '/source',
      destination: '/dest',
      nativeCode: 5,
      recoveryAction: 'none' as const,
      requiredPermission: 'android.permission.READ',
    }
    const cause = new Error('root')
    const error = new ArchiveError('E_PATH_TRAVERSAL', 'Path traversal detected', details, { cause })
    expect(error.code).toBe('E_PATH_TRAVERSAL')
    expect(error.message).toBe('Path traversal detected')
    expect(error.details).toEqual(details)
    expect(error.cause).toBe(cause)
  })

  it('constructs with empty details by default', () => {
    const error = new ArchiveError('E_INVALID_ARGUMENT', 'bad arg')
    expect(error.details).toEqual({})
  })

  it('has correct name', () => {
    const error = new ArchiveError('E_IO', 'IO error')
    expect(error.name).toBe('ArchiveError')
  })

  it('supports all error codes', () => {
    const codes: string[] = [
      'E_INVALID_ARGUMENT', 'E_INVALID_STATE', 'E_DISPOSED',
      'E_INVALID_ARCHIVE', 'E_UNSUPPORTED_FORMAT', 'E_UNSUPPORTED_COMPRESSION',
      'E_UNSUPPORTED_ENCRYPTION', 'E_ENCRYPTED_ARCHIVE', 'E_PASSWORD_REQUIRED',
      'E_BAD_PASSWORD', 'E_ENTRY_NOT_FOUND', 'E_CHECKSUM_MISMATCH',
      'E_TRUNCATED_ARCHIVE', 'E_PATH_TRAVERSAL', 'E_ABSOLUTE_PATH',
      'E_UNSAFE_SYMLINK', 'E_SPECIAL_FILE', 'E_DUPLICATE_ENTRY',
      'E_EXTRACTION_LIMIT_EXCEEDED', 'E_ARCHIVE_TOO_LARGE', 'E_BUFFER_LIMIT_EXCEEDED',
      'E_INSUFFICIENT_STORAGE', 'E_DESTINATION_EXISTS', 'E_PERMISSION_DENIED',
      'E_PERMISSION_REQUIRED', 'E_SECURITY_SCOPE_REQUIRED', 'E_BOOKMARK_STALE',
      'E_READ_ONLY', 'E_URI_PERMISSION_REVOKED', 'E_URI_NOT_SEEKABLE',
      'E_PROVIDER_UNSUPPORTED', 'E_FILE_NOT_AVAILABLE', 'E_OPERATION_CANCELLED',
      'E_IO', 'E_INTERNAL',
    ]
    for (const code of codes) {
      const error = new ArchiveError(code as any, 'test')
      expect(error.code).toBe(code)
    }
  })
})

describe('isArchiveError', () => {
  it('returns true for ArchiveError instances', () => {
    expect(isArchiveError(new ArchiveError('E_INTERNAL', 'test'))).toBe(true)
  })

  it('returns false for Error instances', () => {
    expect(isArchiveError(new Error('test'))).toBe(false)
  })

  it('returns false for TypeError', () => {
    expect(isArchiveError(new TypeError('test'))).toBe(false)
  })

  it('returns false for null', () => {
    expect(isArchiveError(null)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isArchiveError(undefined)).toBe(false)
  })

  it('returns false for plain objects', () => {
    expect(isArchiveError({ code: 'E_INTERNAL' })).toBe(false)
  })

  it('returns false for strings', () => {
    expect(isArchiveError('error')).toBe(false)
  })

  it('narrows the type in conditionals', () => {
    const value: unknown = new ArchiveError('E_IO', 'IO error')
    if (isArchiveError(value)) {
      expect(value.code).toBe('E_IO')
      expect(value.message).toBe('IO error')
    } else {
      throw new Error('should have narrowed')
    }
  })
})
