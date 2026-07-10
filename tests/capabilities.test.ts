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

beforeEach(() => {
  jest.clearAllMocks()
})

describe('getArchiveCapabilities', () => {
  it('returns a capabilities object with required fields', () => {
    const caps = getArchiveCapabilities()
    expect(caps).toHaveProperty('platform')
    expect(caps).toHaveProperty('readableFormats')
    expect(caps).toHaveProperty('writableFormats')
    expect(caps).toHaveProperty('compressionMethods')
    expect(caps).toHaveProperty('encryptionMethods')
    expect(caps).toHaveProperty('supportsFilePaths')
    expect(caps).toHaveProperty('supportsInputUris')
    expect(caps).toHaveProperty('supportsOutputUris')
    expect(caps).toHaveProperty('supportsDirectoryUris')
    expect(caps).toHaveProperty('supportsAtomicPathWrites')
    expect(caps).toHaveProperty('supportsSecurityScopedUrls')
    expect(caps).toHaveProperty('supportsZip64')
  })

  it('reports encryption methods without aes-128', () => {
    const caps = getArchiveCapabilities()
    expect(caps.encryptionMethods).not.toContain('aes-128')
    expect(caps.encryptionMethods).toContain('none')
    expect(caps.encryptionMethods).toContain('zip-crypto')
    expect(caps.encryptionMethods).toContain('aes-256')
  })

  it('reports supportsOutputUris as false', () => {
    const caps = getArchiveCapabilities()
    expect(caps.supportsOutputUris).toBe(false)
  })

  it('reports supportsDirectoryUris as false', () => {
    const caps = getArchiveCapabilities()
    expect(caps.supportsDirectoryUris).toBe(false)
  })
})
