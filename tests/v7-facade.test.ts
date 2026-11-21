jest.mock('react-native-nitro-modules', () => ({
  NitroModules: { createHybridObject: jest.fn() },
}))

import { NitroModules } from 'react-native-nitro-modules'

import {
  ArchiveError,
  bufferEntry,
  bufferSource,
  checkArchiveAccess,
  createArchive,
  detectArchiveFormat,
  directoryDestination,
  directoryUriDestination,
  fileDestination,
  fileSource,
  getArchiveCapabilities,
  openArchive,
  uriEntry,
  uriSource,
} from '../src'

import type { ArchiveFormat, ArchiveReader, ArchiveTask } from '../src'
import type { NativeProgress } from '../src/specs/NativeArchiveTypes'

const source = fileSource('/tmp/archive.tgz')
const destination = directoryDestination('/tmp/out')
const output = fileDestination('/tmp/result.tar.gz')
const nativeReader = {
  format: 'tar.gz',
  entryCount: 3,
  compressedSize: 100,
  totalUncompressedSize: 1200,
  encrypted: false,
  comment: undefined,
  listEntries: jest.fn(),
  getEntry: jest.fn(),
  readEntry: jest.fn(),
  startExtraction: jest.fn(),
  startValidation: jest.fn(),
  dispose: jest.fn(),
}
const nativeModule = {
  getCapabilities: jest.fn(),
  openFile: jest.fn(),
  openUri: jest.fn(),
  detectUri: jest.fn(),
  detectBuffer: jest.fn(),
  checkUriAccess: jest.fn(),
  create: jest.fn(),
}

beforeEach(() => {
  jest.resetAllMocks()
  ;(NitroModules.createHybridObject as jest.Mock).mockReturnValue(nativeModule)
  nativeModule.openFile.mockResolvedValue({ ok: true, reader: nativeReader })
})

it('keeps the advertised TAR formats and native detection outcomes', async () => {
  const formats = ['zip', 'tar', 'tar.gz']
  nativeModule.getCapabilities.mockReturnValue({
    platform: 'android',
    readableFormats: formats,
    writableFormats: formats,
    compressionMethods: ['store', 'deflate'],
    encryptionMethods: ['none', 'zip-crypto', 'aes-256'],
    supportsFilePaths: true,
    supportsInputUris: true,
    supportsOutputUris: true,
    supportsDirectoryUris: true,
    supportsAtomicPathWrites: true,
    supportsSecurityScopedUrls: false,
    supportsZip64: true,
  })
  const contentUri = 'content://documents/archive.zip'
  const buffer = new ArrayBuffer(20)
  nativeModule.detectUri.mockResolvedValue({
    ok: true,
    format: 'tar.gz',
    confidence: 1,
    extensionMatches: false,
  })
  nativeModule.detectBuffer.mockResolvedValue({ ok: true, format: 'tar', confidence: 1 })

  expect(getArchiveCapabilities()).toMatchObject({
    readableFormats: formats,
    writableFormats: formats,
    supportsZip64: true,
  })
  await expect(detectArchiveFormat(uriSource(contentUri))).resolves.toEqual({
    format: 'tar.gz',
    confidence: 1,
    extensionMatches: false,
  })
  await expect(detectArchiveFormat(bufferSource(buffer, 'a.tar'))).resolves.toEqual({
    format: 'tar',
    confidence: 1,
    extensionMatches: undefined,
  })
  expect(nativeModule.detectUri).toHaveBeenCalledWith(contentUri)
  expect(nativeModule.detectBuffer).toHaveBeenCalledWith(buffer)
})

it('preserves provider recovery metadata on denied access', async () => {
  const uri = 'content://documents/tree/destination'
  nativeModule.getCapabilities.mockReturnValue({ platform: 'android' })
  nativeModule.checkUriAccess.mockResolvedValue({
    ok: false,
    accessible: false,
    readable: true,
    writable: false,
    persistent: false,
    securityScoped: false,
    providerBacked: true,
    seekable: false,
    recoveryAction: 'grant-write-access',
    reason: 'Write access is required.',
  })

  const report = await checkArchiveAccess(directoryUriDestination(uri), 'create-children')
  expect(nativeModule.checkUriAccess).toHaveBeenCalledWith(uri, 'create-children')
  expect(report).toMatchObject({
    platform: 'android',
    mode: 'create-children',
    accessible: false,
    providerBacked: true,
    seekable: false,
    recoveryAction: 'grant-write-access',
    reason: 'Write access is required.',
  })
})

it('forwards page filters and preserves metadata and an absent entry', async () => {
  const modifiedAt = new Date('2026-10-21T12:00:00.000Z')
  const entry = {
    index: 1,
    path: 'docs/report.txt',
    name: 'report.txt',
    parentPath: 'docs',
    kind: 'file',
    compressedSize: 0,
    uncompressedSize: 1100,
    encrypted: false,
    compressionMethod: 'deflate',
    modifiedAt: modifiedAt.getTime(),
  }
  nativeReader.listEntries.mockResolvedValue({ entries: [entry], offset: 1, nextOffset: 2, totalEntries: 3 })
  nativeReader.getEntry.mockResolvedValueOnce(entry).mockResolvedValueOnce(undefined)
  const reader = await openArchive(source)

  const kinds = Object.freeze(['file'] as const)
  const page = await reader.listEntries({ offset: 1, limit: 1, prefix: 'docs/', kinds })
  expect(nativeReader.listEntries).toHaveBeenCalledWith(1, 1, 'docs/', ['file'])
  expect(reader).toMatchObject({
    format: 'tar.gz',
    compressedSize: 100n,
    totalUncompressedSize: 1200n,
    encrypted: false,
    comment: undefined,
  })
  expect(page).toMatchObject({
    offset: 1,
    nextOffset: 2,
    totalEntries: 3,
    entries: [{ path: entry.path, compressedSize: 0n, uncompressedSize: 1100n, modifiedAt }],
  })
  await expect(reader.getEntry(entry.path)).resolves.toMatchObject({ modifiedAt, uncompressedSize: 1100n })
  await expect(reader.getEntry('missing.txt')).resolves.toBeUndefined()
  reader.dispose()
  expect(nativeReader.dispose).toHaveBeenCalledTimes(1)
})

it('passes the exact read limit and reports a missing native result as an internal fault', async () => {
  const data = new ArrayBuffer(8)
  nativeReader.readEntry
    .mockResolvedValueOnce({ data })
    .mockResolvedValueOnce({})
    .mockResolvedValueOnce({
      error: { code: 'E_UNSUPPORTED_ENCRYPTION', message: 'TAR archives do not support passwords.' },
    })
  const reader = await openArchive(source)

  await expect(reader.readEntry('report.txt', {} as { maxBytes: bigint })).rejects.toThrow(TypeError)
  expect(nativeReader.readEntry).not.toHaveBeenCalled()
  await expect(reader.readEntry('report.txt', {
    maxBytes: BigInt(Number.MAX_SAFE_INTEGER),
    verifyChecksum: true,
  })).resolves.toBe(data)
  expect(nativeReader.readEntry).toHaveBeenLastCalledWith(
    'report.txt', Number.MAX_SAFE_INTEGER, undefined, true,
  )
  await expect(reader.readEntry('report.txt', { maxBytes: 8n })).rejects.toMatchObject({
    code: 'E_INTERNAL',
  })
  await expect(reader.readEntry('report.txt', {
    maxBytes: 8n,
    password: 'provided-password',
  })).rejects.toMatchObject({ code: 'E_UNSUPPORTED_ENCRYPTION' })
})

it('preserves a native open error and its diagnostic context', async () => {
  const uri = 'content://documents/archive.tgz'
  nativeModule.openUri.mockResolvedValue({
    ok: false,
    error: {
      code: 'E_URI_PERMISSION_REVOKED',
      message: 'The document grant was revoked.',
      source: uri,
      nativeCode: 13,
    },
  })

  await expect(openArchive(uriSource(uri), { maxEntriesToIndex: 40 })).rejects.toMatchObject({
    name: 'ArchiveError',
    code: 'E_URI_PERMISSION_REVOKED',
    message: 'The document grant was revoked.',
    details: { source: uri, nativeCode: 13 },
  })
  expect(nativeModule.openUri).toHaveBeenCalledWith(uri, expect.objectContaining({ maxEntriesToIndex: 40 }))
})

it('passes provider inputs and a bounded buffer to TAR.GZ creation', () => {
  nativeModule.create.mockReturnValue(makeNativeTask({}).task)
  const data = new ArrayBuffer(16)
  const modifiedAt = new Date('2026-10-21T12:00:00.000Z')
  const uri = 'file:///documents/report.txt'
  const task = createArchive({
    format: 'tar.gz',
    destination: output,
    maxInMemoryBytes: 16n,
    entries: [
      uriEntry(uriSource(uri, { iosSecurityScope: 'required' }), 'report.txt'),
      bufferEntry(data, 'notes.txt', { modifiedAt }),
    ],
  })

  expect(nativeModule.create).toHaveBeenCalledWith(expect.objectContaining({
    format: 'tar.gz',
    maxInMemoryBytes: 16,
    entries: [
      expect.objectContaining({ kind: 'uri', sourceUri: uri, iosSecurityScope: 'required' }),
      expect.objectContaining({ kind: 'buffer', data, modifiedAt: modifiedAt.getTime() }),
    ],
  }))
  task.dispose()
})

it('rejects unrecognized output formats from JavaScript callers before creating a task', () => {
  expect(() => createArchive({
    format: 'rar' as ArchiveFormat,
    destination: output,
    entries: [],
  })).toThrow(expect.objectContaining({ code: 'E_UNSUPPORTED_FORMAT' }))
  expect(nativeModule.create).not.toHaveBeenCalled()
})

const initialProgress: NativeProgress = {
  operationId: 'archive-task',
  phase: 'preparing',
  processedBytes: 0,
  processedEntries: 0,
}

function makeNativeTask(result: object) {
  let emit: (snapshot: NativeProgress) => void = () => {}
  const unsubscribe = jest.fn()
  const task = {
    state: 'idle',
    progress: initialProgress,
    start: jest.fn().mockResolvedValue(result),
    cancel: jest.fn().mockReturnValue(true),
    onProgress: jest.fn((callback: typeof emit) => {
      emit = callback
      return unsubscribe
    }),
  }
  return { task, unsubscribe, emit: (snapshot: NativeProgress) => emit(snapshot) }
}

const taskCases: {
  operation: string
  register: jest.Mock
  make: (reader: ArchiveReader) => ArchiveTask<unknown>
  success: object
  expected: object
}[] = [
  {
    operation: 'creation',
    register: nativeModule.create,
    make: () => createArchive({
      format: 'tar.gz',
      destination: output,
      entries: [bufferEntry(new ArrayBuffer(50), 'first.txt'), bufferEntry(new ArrayBuffer(50), 'second.txt')],
    }),
    success: { entryCount: 2, inputBytes: 100, outputBytes: 81, atomicWriteApplied: true, warnings: [] },
    expected: { output, entryCount: 2, inputBytes: 100n, outputBytes: 81n },
  },
  {
    operation: 'extraction',
    register: nativeReader.startExtraction,
    make: (reader) => reader.extract({ destination, include: ['docs/**'] }),
    success: { extractedEntries: 2, skippedEntries: 1, writtenBytes: 100, atomicWriteApplied: false, warnings: [] },
    expected: { destination, extractedEntries: 2, skippedEntries: 1, writtenBytes: 100n },
  },
  {
    operation: 'validation',
    register: nativeReader.startValidation,
    make: (reader) => reader.validate({ limits: { maxEntries: 3 }, scanAllEntries: true }),
    success: { valid: true, checkedEntries: 2, checkedUncompressedBytes: 100, encryptedEntries: 0, issues: [] },
    expected: { valid: true, checkedEntries: 2, checkedUncompressedBytes: 100n },
  },
]

describe.each(taskCases)('$operation through the public façade', ({ register, make, success, expected }) => {
  it('starts once and forwards the native result and state', async () => {
    const operationId = initialProgress.operationId
    const { task: native, unsubscribe } = makeNativeTask({ ...success, operationId, durationMs: 4 })
    register.mockReturnValue(native)
    const task = make(await openArchive(source))
    expect(task.state).toBe('idle')
    expect(task.id).toBe(operationId)

    await expect(task.start()).resolves.toMatchObject({ ...expected, operationId })
    await expect(task.start()).rejects.toMatchObject({ code: 'E_INVALID_STATE' })
    expect(native.start).toHaveBeenCalledTimes(1)

    native.state = 'succeeded'
    expect(task.state).toBe('succeeded')
    task.dispose()
    task.dispose()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('converts the failure payload before interpreting success fields', async () => {
    const details = {
      operationId: initialProgress.operationId,
      entryPath: 'docs/report.txt',
      source: source.path,
      destination: '/tmp/out',
      nativeCode: 17,
    }
    const error = { code: 'E_OPERATION_CANCELLED', message: 'Operation cancelled.', ...details }
    const { task: native } = makeNativeTask({ error })
    register.mockReturnValue(native)
    const task = make(await openArchive(source))

    expect(task.cancel()).toBe(true)
    const result = task.start()
    await expect(result).rejects.toBeInstanceOf(ArchiveError)
    await expect(result).rejects.toMatchObject({
      code: error.code,
      message: error.message,
      details,
    })
    task.dispose()
  })

  it('updates progress, isolates bad listeners, and releases subscriptions', async () => {
    const { task: native, emit, unsubscribe } = makeNativeTask({})
    register.mockReturnValue(native)
    const task = make(await openArchive(source))
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const good = jest.fn()
    const error = new Error('Listener failed')
    task.onProgress(() => { throw error })
    const remove = task.onProgress(good)

    try {
      const next = { ...initialProgress, processedBytes: 10, totalBytes: 40, percentage: 25 }
      emit(next)
      expect(task.progress).toMatchObject({ processedBytes: 10n, totalBytes: 40n, percentage: 25 })
      expect(good).toHaveBeenCalledWith(task.progress)
      expect(warn).toHaveBeenCalledWith('[ArchiveProgress] Listener threw:', error)

      remove()
      emit({ ...next, processedBytes: 20 })
      expect(good).toHaveBeenCalledTimes(1)
      expect(task.progress.processedBytes).toBe(20n)

      task.dispose()
      const late = jest.fn()
      task.onProgress(late)()
      emit({ ...next, processedBytes: 30 })

      expect(unsubscribe).toHaveBeenCalledTimes(1)
      expect(late).not.toHaveBeenCalled()
      expect(task.progress.processedBytes).toBe(20n)
    } finally {
      task.dispose()
      warn.mockRestore()
    }
  })
})
