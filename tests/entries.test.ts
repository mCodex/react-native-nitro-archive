import { fileEntry, uriEntry, directoryEntry, bufferEntry } from '../src/entries'
import type { ArchiveUriSource } from '../src/types/archive'

describe('fileEntry', () => {
  it('creates a file entry', () => {
    const entry = fileEntry('/tmp/photo.jpg', 'photos/photo.jpg')
    expect(entry).toEqual({
      kind: 'file',
      sourcePath: '/tmp/photo.jpg',
      archivePath: 'photos/photo.jpg',
    })
  })

  it('creates a file entry with compression method', () => {
    const entry = fileEntry('/tmp/a.txt', 'a.txt', { compressionMethod: 'store' })
    expect(entry.compressionMethod).toBe('store')
  })

  it('returns a frozen object', () => {
    expect(Object.isFrozen(fileEntry('/tmp/a.txt', 'a.txt'))).toBe(true)
  })

  it('throws TypeError for relative source path', () => {
    expect(() => fileEntry('relative/file.txt', 'file.txt')).toThrow(TypeError)
    expect(() => fileEntry('relative/file.txt', 'file.txt')).toThrow(
      'fileEntry(sourcePath) requires an absolute path.',
    )
  })
})

describe('uriEntry', () => {
  const source: ArchiveUriSource = { kind: 'uri', uri: 'content://media/file', iosSecurityScope: 'auto' }

  it('creates a uri entry', () => {
    const entry = uriEntry(source, 'documents/file.pdf')
    expect(entry).toEqual({
      kind: 'uri',
      source,
      archivePath: 'documents/file.pdf',
    })
  })

  it('creates a uri entry with compression method', () => {
    const entry = uriEntry(source, 'documents/file.pdf', { compressionMethod: 'deflate' })
    expect(entry.compressionMethod).toBe('deflate')
  })

  it('returns a frozen object', () => {
    expect(Object.isFrozen(uriEntry(source, 'a.pdf'))).toBe(true)
  })

  it('accepts empty-string archive path', () => {
    const entry = uriEntry(source, '')
    expect(entry.archivePath).toBe('')
  })
})

describe('directoryEntry', () => {
  it('creates a directory entry with defaults', () => {
    const entry = directoryEntry('/tmp/docs', 'documents')
    expect(entry).toEqual({
      kind: 'directory',
      sourcePath: '/tmp/docs',
      archivePath: 'documents',
      recursive: true,
      includeHidden: false,
      followSymlinks: false,
      include: undefined,
      exclude: undefined,
    })
  })

  it('creates a directory entry with custom options', () => {
    const entry = directoryEntry('/tmp/docs', 'documents', {
      recursive: false,
      includeHidden: true,
      followSymlinks: true,
      include: ['*.txt'],
      exclude: ['*.tmp'],
    })
    expect(entry.recursive).toBe(false)
    expect(entry.includeHidden).toBe(true)
    expect(entry.followSymlinks).toBe(true)
    expect(entry.include).toEqual(['*.txt'])
    expect(entry.exclude).toEqual(['*.tmp'])
  })

  it('returns a frozen object', () => {
    expect(Object.isFrozen(directoryEntry('/tmp/a', 'a'))).toBe(true)
  })

  it('throws TypeError for relative source path', () => {
    expect(() => directoryEntry('relative/path', 'archive')).toThrow(TypeError)
    expect(() => directoryEntry('relative/path', 'archive')).toThrow(
      'directoryEntry(sourcePath) requires an absolute path.',
    )
  })
})

describe('bufferEntry', () => {
  it('creates a buffer entry', () => {
    const data = new ArrayBuffer(8)
    const entry = bufferEntry(data, 'manifest.json')
    expect(entry).toEqual({
      kind: 'buffer',
      data,
      archivePath: 'manifest.json',
    })
  })

  it('creates a buffer entry with date and compression', () => {
    const date = new Date('2025-01-01')
    const entry = bufferEntry(new ArrayBuffer(4), 'data.bin', {
      modifiedAt: date,
      compressionMethod: 'store',
    })
    expect(entry.modifiedAt).toBe(date)
    expect(entry.compressionMethod).toBe('store')
  })

  it('returns a frozen object', () => {
    expect(Object.isFrozen(bufferEntry(new ArrayBuffer(0), 'empty'))).toBe(true)
  })
})
