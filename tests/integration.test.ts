jest.mock('react-native-nitro-modules', () => {
  const mockTask = {
    state: 'idle',
    progress: {
      operationId: 'mock-op',
      phase: 'preparing',
      processedBytes: 0,
      processedEntries: 0,
    },
    start: jest.fn(),
    cancel: jest.fn().mockReturnValue(true),
    onProgress: jest.fn().mockReturnValue(jest.fn()),
  }

  const mockReader = {
    format: 'zip',
    entryCount: 2,
    compressedSize: 500,
    totalUncompressedSize: 2000,
    encrypted: false,
    comment: 'test archive',
    listEntries: jest.fn().mockResolvedValue({
      entries: [
        {
          index: 0, path: 'a.txt', name: 'a.txt', parentPath: '',
          kind: 'file', compressedSize: 100, uncompressedSize: 500,
          encrypted: false, compressionMethod: 'store',
        },
        {
          index: 1, path: 'b.txt', name: 'b.txt', parentPath: '',
          kind: 'file', compressedSize: 200, uncompressedSize: 1000,
          encrypted: false, compressionMethod: 'deflate',
        },
      ],
      offset: 0,
      totalEntries: 2,
    }),
    getEntry: jest.fn(),
    readEntry: jest.fn(),
    startExtraction: jest.fn().mockReturnValue({ ...mockTask, state: 'idle' }),
    startValidation: jest.fn().mockReturnValue({ ...mockTask, state: 'idle' }),
    dispose: jest.fn(),
  }

  const mockModule = {
    getCapabilities: jest.fn().mockReturnValue({
      platform: 'ios',
      readableFormats: ['zip'],
      writableFormats: ['zip'],
      compressionMethods: ['store', 'deflate'],
      encryptionMethods: ['none'],
      supportsFilePaths: true,
      supportsInputUris: true,
      supportsOutputUris: false,
      supportsDirectoryUris: false,
      supportsAtomicPathWrites: true,
      supportsSecurityScopedUrls: true,
      supportsZip64: true,
    }),
    checkFileAccess: jest.fn(),
    checkUriAccess: jest.fn(),
    detectFile: jest.fn(),
    detectUri: jest.fn(),
    detectBuffer: jest.fn(),
    openFile: jest.fn().mockResolvedValue({ ok: true, reader: mockReader }),
    openUri: jest.fn().mockResolvedValue({ ok: true, reader: mockReader }),
    openBuffer: jest.fn().mockResolvedValue({ ok: true, reader: mockReader }),
    create: jest.fn().mockReturnValue({ ...mockTask, state: 'idle' }),
  }

  return {
    NitroModules: {
      createHybridObject: jest.fn().mockReturnValue(mockModule),
    },
  }
})

import { openArchive } from '../src/archive'
import { createArchive } from '../src/create'
import { detectArchiveFormat } from '../src/detect'
import { getArchiveCapabilities } from '../src/capabilities'
import { checkArchiveAccess } from '../src/access'
import { fileSource, uriSource, bufferSource } from '../src/sources'
import { fileDestination } from '../src/destinations'
import { ArchiveError } from '../src/errors'
import { getNativeArchiveModule } from '../src/internal/getNativeModule'

beforeEach(() => {
  jest.clearAllMocks()
})

describe('getArchiveCapabilities', () => {
  it('returns capabilities', () => {
    const caps = getArchiveCapabilities()
    expect(caps.platform).toBe('ios')
    expect(caps.readableFormats).toContain('zip')
    expect(caps.supportsFilePaths).toBe(true)
  })

  it('creates native module on first call', () => {
    const module = getNativeArchiveModule()
    expect(module).toBeDefined()
  })
})

describe('openArchive', () => {
  it('opens a file source and returns a reader', async () => {
    const reader = await openArchive(fileSource('/tmp/test.zip'))
    expect(reader.format).toBe('zip')
    expect(reader.entryCount).toBe(2)
  })

  it('opens a uri source', async () => {
    const reader = await openArchive(uriSource('content://test/archive.zip'))
    expect(reader.format).toBe('zip')
  })

  it('opens a buffer source', async () => {
    const reader = await openArchive(bufferSource(new ArrayBuffer(100), 'test.zip'))
    expect(reader.format).toBe('zip')
  })

  it('lists entries via the reader', async () => {
    const reader = await openArchive(fileSource('/tmp/test.zip'))
    const page = await reader.listEntries()
    expect(page.entries).toHaveLength(2)
    expect(page.offset).toBe(0)
    expect(page.totalEntries).toBe(2)
  })

  it('disposes the reader', async () => {
    const reader = await openArchive(fileSource('/tmp/test.zip'))
    reader.dispose()
  })

  it('creates extraction task', async () => {
    const reader = await openArchive(fileSource('/tmp/test.zip'))
    const task = reader.extract({
      destination: { kind: 'directory', path: '/tmp/out' },
    })
    expect(task.state).toBe('idle')
    expect(task.cancel()).toBe(true)
  })
})

describe('createArchive', () => {
  it('creates a creation task', () => {
    const task = createArchive({
      destination: fileDestination('/tmp/out.zip'),
      entries: [
        { kind: 'file', sourcePath: '/tmp/a.txt', archivePath: 'a.txt' },
      ],
    })
    expect(task.state).toBe('idle')
    expect(task.cancel()).toBe(true)
  })
})

describe('detectArchiveFormat', () => {
  it('returns detection result for file source', async () => {
    const mod = getNativeArchiveModule()
    ;(mod.detectFile as jest.Mock).mockResolvedValue({
      ok: true, format: 'zip', confidence: 1, extensionMatches: true,
    })
    const result = await detectArchiveFormat(fileSource('/tmp/test.zip'))
    expect(result.format).toBe('zip')
    expect(result.confidence).toBe(1)
  })

  it('throws ArchiveError on detection failure', async () => {
    const mod = getNativeArchiveModule()
    ;(mod.detectFile as jest.Mock).mockResolvedValue({
      ok: false, confidence: 0,
      error: { code: 'E_UNSUPPORTED_FORMAT', message: 'Not a ZIP' },
    })
    await expect(
      detectArchiveFormat(fileSource('/tmp/unknown.bin')),
    ).rejects.toThrow(ArchiveError)
  })
})

describe('checkArchiveAccess', () => {
  it('checks file access', async () => {
    const mod = getNativeArchiveModule()
    ;(mod.checkFileAccess as jest.Mock).mockResolvedValue({
      ok: true, accessible: true, readable: true, writable: true,
      persistent: true, securityScoped: false, providerBacked: false,
      reason: undefined, recoveryAction: 'none',
    })
    const report = await checkArchiveAccess(fileSource('/tmp/test.zip'), 'read')
    expect(report.accessible).toBe(true)
    expect(report.mode).toBe('read')
  })

  it('checks buffer access without native call', async () => {
    const report = await checkArchiveAccess(bufferSource(new ArrayBuffer(10)), 'read')
    expect(report.accessible).toBe(true)
  })
})
