jest.mock('react-native-nitro-modules', () => ({
  NitroModules: {
    createHybridObject: jest.fn().mockReturnValue({
      getCapabilities: jest.fn().mockReturnValue({
        platform: 'android',
        readableFormats: ['zip'],
        writableFormats: ['zip'],
        compressionMethods: ['store', 'deflate'],
        encryptionMethods: ['none', 'zip-crypto', 'aes-256'],
        supportsFilePaths: true,
        supportsInputUris: true,
        supportsOutputUris: false,
        supportsDirectoryUris: false,
        supportsAtomicPathWrites: false,
        supportsSecurityScopedUrls: false,
        supportsZip64: true,
      }),
    }),
  },
}))

import { getArchiveCapabilities } from '../src/capabilities'

describe('cross-platform parity', () => {
  it('reports identical capability keys', () => {
    const caps = getArchiveCapabilities()
    const requiredKeys = [
      'platform', 'readableFormats', 'writableFormats',
      'compressionMethods', 'encryptionMethods',
      'supportsFilePaths', 'supportsInputUris', 'supportsOutputUris',
      'supportsDirectoryUris', 'supportsAtomicPathWrites',
      'supportsSecurityScopedUrls', 'supportsZip64'
    ]
    for (const key of requiredKeys) {
      expect(caps).toHaveProperty(key)
    }
  })

  it('supports only zip format', () => {
    const caps = getArchiveCapabilities()
    expect(caps.readableFormats).toEqual(['zip'])
    expect(caps.writableFormats).toEqual(['zip'])
  })

  it('supports store and deflate compression', () => {
    const caps = getArchiveCapabilities()
    expect(caps.compressionMethods).toEqual(['store', 'deflate'])
  })

  it('supports file paths on all platforms', () => {
    const caps = getArchiveCapabilities()
    expect(caps.supportsFilePaths).toBe(true)
  })

  it('does not claim atomic path writes', () => {
    const caps = getArchiveCapabilities()
    expect(caps.supportsAtomicPathWrites).toBe(false)
  })
})
