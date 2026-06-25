import { fileSource, uriSource, bufferSource } from '../src/sources'

describe('fileSource', () => {
  it('creates a file source from an absolute path', () => {
    const source = fileSource('/tmp/archive.zip')
    expect(source).toEqual({ kind: 'file', path: '/tmp/archive.zip' })
  })

  it('returns a frozen object', () => {
    const source = fileSource('/tmp/archive.zip')
    expect(Object.isFrozen(source)).toBe(true)
  })

  it('throws TypeError for relative path', () => {
    expect(() => fileSource('relative/path.zip')).toThrow(TypeError)
    expect(() => fileSource('relative/path.zip')).toThrow(
      'fileSource(path) requires an absolute path.',
    )
  })

  it('throws TypeError for empty string', () => {
    expect(() => fileSource('')).toThrow(TypeError)
  })

  it('accepts root path', () => {
    const source = fileSource('/')
    expect(source.path).toBe('/')
  })
})

describe('uriSource', () => {
  it('creates a uri source with default security scope', () => {
    const source = uriSource('content://media/external/file')
    expect(source).toEqual({
      kind: 'uri',
      uri: 'content://media/external/file',
      iosSecurityScope: 'auto',
    })
  })

  it('creates a uri source with custom security scope', () => {
    const source = uriSource('file:///tmp/archive.zip', { iosSecurityScope: 'required' })
    expect(source.iosSecurityScope).toBe('required')
  })

  it('creates a uri source with disabled security scope', () => {
    const source = uriSource('file:///tmp/archive.zip', { iosSecurityScope: 'disabled' })
    expect(source.iosSecurityScope).toBe('disabled')
  })

  it('returns a frozen object', () => {
    const source = uriSource('file:///tmp/a.zip')
    expect(Object.isFrozen(source)).toBe(true)
  })

  it('throws TypeError for string without scheme', () => {
    expect(() => uriSource('/absolute/path.zip')).toThrow(TypeError)
    expect(() => uriSource('/absolute/path.zip')).toThrow(
      'uriSource(uri) requires an absolute URI.',
    )
  })

  it('throws TypeError for empty string', () => {
    expect(() => uriSource('')).toThrow(TypeError)
  })

  it('accepts unusual URIs as long as they contain ://', () => {
    const source = uriSource('://')
    expect(source.uri).toBe('://')
  })
})

describe('bufferSource', () => {
  it('creates a buffer source from ArrayBuffer', () => {
    const data = new ArrayBuffer(10)
    const source = bufferSource(data)
    expect(source.kind).toBe('buffer')
    expect(source.data).toBe(data)
    expect(source.name).toBeUndefined()
  })

  it('returns a frozen object', () => {
    const source = bufferSource(new ArrayBuffer(0))
    expect(Object.isFrozen(source)).toBe(true)
  })

  it('accepts an optional name', () => {
    const source = bufferSource(new ArrayBuffer(5), 'archive.zip')
    expect(source.name).toBe('archive.zip')
  })

  it('accepts empty ArrayBuffer', () => {
    const source = bufferSource(new ArrayBuffer(0))
    expect(source.data.byteLength).toBe(0)
  })
})
