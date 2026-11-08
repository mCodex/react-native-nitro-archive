import { mapCreationOptions, mapExtractionOptions, mapOpenOptions, mapValidationOptions } from '../src/internal/nativeAdapter'
import { ArchiveReaderWrapper } from '../src/internal/ArchiveReaderWrapper'
import type { NativeArchiveReader } from '../src/specs/NativeArchiveReader.nitro'

describe('native argument boundaries', () => {
  it.each([-1n, 0n, 9007199254740992n])('rejects unsafe byte limit %s before opening', (limit) => {
    expect(() => mapOpenOptions({ maxCentralDirectoryBytes: limit })).toThrow(TypeError)
  })

  it('preserves exact bounded integers when crossing the number bridge', () => {
    expect(mapOpenOptions({ maxCentralDirectoryBytes: 9007199254740991n }).path.maxCentralDirectoryBytes).toBe(9007199254740991)
  })

  it.each([NaN, Infinity, -1, 0, 1.5])('rejects invalid entry count %s', (maxEntries) => {
    expect(() => mapExtractionOptions({ destination: { kind: 'directory', path: '/out' }, limits: { maxEntries } })).toThrow(TypeError)
  })

  it('rejects a negative creation buffer budget', () => {
    expect(() => mapCreationOptions({ destination: { kind: 'file', path: '/out.zip' }, entries: [], maxInMemoryBytes: -1n })).toThrow(TypeError)
  })

  it('does not discard validation limits', () => {
    expect(mapValidationOptions({ limits: { maxEntryUncompressedBytes: 42n, maxEntries: 3 } }).limits).toMatchObject({ maxEntryUncompressedBytes: 42, maxEntries: 3 })
  })

  it('does not silently ignore a requested unsupported security policy', () => {
    expect(() => mapExtractionOptions({ destination: { kind: 'directory', path: '/out' }, security: { symlinks: 'preserve-safe' } })).toThrow()
  })

  it('rejects conflicting selection before creating a native task', () => {
    expect(() => mapExtractionOptions({ destination: { kind: 'directory', path: '/out' }, entries: ['a'], include: ['**'] })).toThrow(TypeError)
  })

  it('rejects an imprecise read limit without invoking native code', async () => {
    const readEntry = jest.fn()
    const reader = new ArchiveReaderWrapper({ readEntry } as unknown as NativeArchiveReader)
    await expect(reader.readEntry('a', { maxBytes: 9007199254740992n })).rejects.toThrow(TypeError)
    expect(readEntry).not.toHaveBeenCalled()
  })

  it.each([{ offset: -1 }, { limit: 0 }, { limit: 2001 }, { offset: NaN }])('rejects invalid pagination %o', async (options) => {
    const listEntries = jest.fn()
    const reader = new ArchiveReaderWrapper({ listEntries } as unknown as NativeArchiveReader)
    await expect(reader.listEntries(options)).rejects.toThrow(TypeError)
    expect(listEntries).not.toHaveBeenCalled()
  })
})
