import {
  fileDestination,
  uriDestination,
  directoryDestination,
  directoryUriDestination,
} from '../src/destinations'

describe('fileDestination', () => {
  it('creates a file destination from an absolute path', () => {
    const dest = fileDestination('/tmp/output.zip')
    expect(dest).toEqual({ kind: 'file', path: '/tmp/output.zip' })
  })

  it('returns a frozen object', () => {
    expect(Object.isFrozen(fileDestination('/tmp/a.zip'))).toBe(true)
  })

  it('throws TypeError for relative path', () => {
    expect(() => fileDestination('relative.zip')).toThrow(TypeError)
    expect(() => fileDestination('relative.zip')).toThrow(
      'fileDestination(path) requires an absolute path.',
    )
  })
})

describe('uriDestination', () => {
  it('creates a uri destination with default security scope', () => {
    const dest = uriDestination('content://write/file.zip')
    expect(dest).toEqual({
      kind: 'uri',
      uri: 'content://write/file.zip',
      iosSecurityScope: 'auto',
    })
  })

  it('creates a uri destination with custom security scope', () => {
    const dest = uriDestination('file:///tmp/a.zip', { iosSecurityScope: 'required' })
    expect(dest.iosSecurityScope).toBe('required')
  })

  it('returns a frozen object', () => {
    expect(Object.isFrozen(uriDestination('file:///a.zip'))).toBe(true)
  })

  it('throws TypeError for string without scheme', () => {
    expect(() => uriDestination('/absolute/path.zip')).toThrow(TypeError)
    expect(() => uriDestination('/absolute/path.zip')).toThrow(
      'uriDestination(uri) requires an absolute URI.',
    )
  })
})

describe('directoryDestination', () => {
  it('creates a directory destination from an absolute path', () => {
    const dest = directoryDestination('/tmp/output')
    expect(dest).toEqual({ kind: 'directory', path: '/tmp/output' })
  })

  it('returns a frozen object', () => {
    expect(Object.isFrozen(directoryDestination('/tmp/out'))).toBe(true)
  })

  it('throws TypeError for relative path', () => {
    expect(() => directoryDestination('relative/path')).toThrow(TypeError)
    expect(() => directoryDestination('relative/path')).toThrow(
      'directoryDestination(path) requires an absolute path.',
    )
  })
})

describe('directoryUriDestination', () => {
  it('creates a directory URI destination with default security scope', () => {
    const dest = directoryUriDestination('content://tree/document/')
    expect(dest).toEqual({
      kind: 'directory-uri',
      uri: 'content://tree/document/',
      iosSecurityScope: 'auto',
    })
  })

  it('creates a directory URI destination with custom security scope', () => {
    const dest = directoryUriDestination('file:///tmp/dir', { iosSecurityScope: 'disabled' })
    expect(dest.iosSecurityScope).toBe('disabled')
  })

  it('returns a frozen object', () => {
    expect(Object.isFrozen(directoryUriDestination('content://tree/'))).toBe(true)
  })

  it('throws TypeError for string without scheme', () => {
    expect(() => directoryUriDestination('/absolute/path')).toThrow(TypeError)
    expect(() => directoryUriDestination('/absolute/path')).toThrow(
      'directoryUriDestination(uri) requires an absolute URI.',
    )
  })
})
