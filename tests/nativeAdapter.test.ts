import {
  mapEntry,
  mapEntryPage,
  mapProgress,
  mapCapabilities,
  mapDetection,
  mapAccessReport,
  openOutcomeOrThrow,
  mapExtractionOptions,
  mapCreationOptions,
  mapExtractionResult,
  mapCreationResult,
  mapValidationResult,
  mapValidationOptions,
  mapOpenOptions,
} from '../src/internal/nativeAdapter'
import { ArchiveError } from '../src/errors'
import type { ArchiveEntry } from '../src/types/archive'

describe('mapEntry', () => {
  it('maps a complete native entry to ArchiveEntry', () => {
    const result = mapEntry({
      index: 0,
      path: 'documents/report.pdf',
      name: 'report.pdf',
      parentPath: 'documents',
      kind: 'file',
      compressedSize: 500,
      uncompressedSize: 2000,
      encrypted: false,
      compressionMethod: 'deflate',
      modifiedAt: 1700000000000,
      crc32: 123456789,
      unixMode: 0o644,
    })
    expect(result).toEqual({
      index: 0,
      path: 'documents/report.pdf',
      name: 'report.pdf',
      parentPath: 'documents',
      kind: 'file',
      compressedSize: 500n,
      uncompressedSize: 2000n,
      encrypted: false,
      compressionMethod: 'deflate',
      modifiedAt: new Date(1700000000000),
      crc32: 123456789,
      unixMode: 0o644,
    })
  })

  it('handles optional fields being undefined', () => {
    const result = mapEntry({
      index: 1,
      path: 'empty',
      name: 'empty',
      parentPath: '',
      kind: 'directory',
      compressedSize: 0,
      uncompressedSize: 0,
      encrypted: false,
      compressionMethod: 'store',
      modifiedAt: undefined,
      crc32: undefined,
      unixMode: undefined,
    })
    expect(result.modifiedAt).toBeUndefined()
    expect(result.crc32).toBeUndefined()
    expect(result.unixMode).toBeUndefined()
    expect(result.compressedSize).toBe(0n)
    expect(result.uncompressedSize).toBe(0n)
  })

  it('converts size values using BigInt', () => {
    const entry = mapEntry({
      index: 0,
      path: 'big',
      name: 'big',
      parentPath: '',
      kind: 'file',
      compressedSize: 9007199254740991,
      uncompressedSize: 9007199254740991,
      encrypted: false,
      compressionMethod: 'store',
    })
    expect(typeof entry.compressedSize).toBe('bigint')
    expect(typeof entry.uncompressedSize).toBe('bigint')
    expect(entry.compressedSize).toBe(9007199254740991n)
  })
})

describe('mapEntryPage', () => {
  it('maps a native entry page', () => {
    const page = mapEntryPage({
      entries: [
        {
          index: 0, path: 'a.txt', name: 'a.txt', parentPath: '',
          kind: 'file', compressedSize: 10, uncompressedSize: 20,
          encrypted: false, compressionMethod: 'store',
        },
      ],
      offset: 0,
      nextOffset: 1,
      totalEntries: 1,
    })
    expect(page.entries).toHaveLength(1)
    expect(page.offset).toBe(0)
    expect(page.nextOffset).toBe(1)
    expect(page.totalEntries).toBe(1)
  })

  it('handles missing nextOffset', () => {
    const page = mapEntryPage({
      entries: [],
      offset: 0,
      totalEntries: 0,
    })
    expect(page.nextOffset).toBeUndefined()
  })
})

describe('mapProgress', () => {
  it('maps native progress to ArchiveProgress', () => {
    const result = mapProgress({
      operationId: 'op-1',
      phase: 'extracting',
      processedBytes: 5000,
      totalBytes: 10000,
      processedEntries: 5,
      totalEntries: 10,
      currentEntry: 'file.txt',
      bytesPerSecond: 1000000,
      estimatedSecondsRemaining: 5,
      percentage: 50,
    })
    expect(result.operationId).toBe('op-1')
    expect(result.phase).toBe('extracting')
    expect(result.processedBytes).toBe(5000n)
    expect(result.totalBytes).toBe(10000n)
    expect(result.processedEntries).toBe(5)
    expect(result.totalEntries).toBe(10)
    expect(result.currentEntry).toBe('file.txt')
    expect(result.percentage).toBe(50)
  })

  it('handles optional progress fields', () => {
    const result = mapProgress({
      operationId: 'op-2',
      phase: 'preparing',
      processedBytes: 0,
      processedEntries: 0,
    })
    expect(result.totalBytes).toBeUndefined()
    expect(result.totalEntries).toBeUndefined()
    expect(result.currentEntry).toBeUndefined()
    expect(result.bytesPerSecond).toBeUndefined()
    expect(result.estimatedSecondsRemaining).toBeUndefined()
    expect(result.percentage).toBeUndefined()
  })
})

describe('mapCapabilities', () => {
  it('maps native capabilities', () => {
    const result = mapCapabilities({
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
    })
    expect(result.platform).toBe('ios')
    expect(result.readableFormats).toEqual(['zip'])
    expect(result.supportsFilePaths).toBe(true)
    expect(result.supportsZip64).toBe(true)
  })

  it('maps android platform', () => {
    const result = mapCapabilities({
      platform: 'android',
      readableFormats: ['zip'],
      writableFormats: ['zip'],
      compressionMethods: ['store', 'deflate'],
      encryptionMethods: ['none'],
      supportsFilePaths: true,
      supportsInputUris: true,
      supportsOutputUris: true,
      supportsDirectoryUris: true,
      supportsAtomicPathWrites: false,
      supportsSecurityScopedUrls: false,
      supportsZip64: true,
    })
    expect(result.platform).toBe('android')
  })
})

describe('mapDetection', () => {
  it('maps a successful detection outcome', () => {
    const result = mapDetection({
      ok: true,
      format: 'zip',
      confidence: 1,
      extensionMatches: true,
    })
    expect(result.format).toBe('zip')
    expect(result.confidence).toBe(1)
    expect(result.extensionMatches).toBe(true)
  })

  it('maps a detection outcome without format', () => {
    const result = mapDetection({
      ok: true,
      format: undefined,
      confidence: 0,
    })
    expect(result.format).toBeUndefined()
    expect(result.confidence).toBe(0)
  })

  it('throws ArchiveError on failed detection', () => {
    expect(() =>
      mapDetection({
        ok: false,
        format: undefined,
        confidence: 0,
        error: { code: 'E_UNSUPPORTED_FORMAT', message: 'Not a ZIP file' },
      }),
    ).toThrow(ArchiveError)
  })

  it('throws ArchiveError with correct code on failure', () => {
    try {
      mapDetection({
        ok: false,
        format: undefined,
        confidence: 0,
        error: { code: 'E_UNSUPPORTED_FORMAT', message: 'Unsupported' },
      })
      throw new Error('should have thrown')
    } catch (e) {
      if (e instanceof ArchiveError) {
        expect(e.code).toBe('E_UNSUPPORTED_FORMAT')
        expect(e.message).toBe('Unsupported')
      } else {
        throw e
      }
    }
  })

  it('throws with E_INTERNAL when error is missing', () => {
    expect(() =>
      mapDetection({
        ok: false,
        format: undefined,
        confidence: 0,
      }),
    ).toThrow(ArchiveError)
  })
})

describe('mapAccessReport', () => {
  it('maps a native access outcome', () => {
    const result = mapAccessReport(
      {
        ok: true,
        accessible: true,
        readable: true,
        writable: false,
        persistent: true,
        securityScoped: false,
        providerBacked: false,
        reason: undefined,
        recoveryAction: 'none',
      },
      'read',
    )
    expect(result.platform).toBe('ios')
    expect(result.mode).toBe('read')
    expect(result.accessible).toBe(true)
    expect(result.readable).toBe(true)
    expect(result.writable).toBe(false)
    expect(result.reason).toBeUndefined()
  })
})

describe('openOutcomeOrThrow', () => {
  it('returns the reader on success', () => {
    const mockReader = { format: 'zip' } as any
    const result = openOutcomeOrThrow({ ok: true, reader: mockReader })
    expect(result).toBe(mockReader)
  })

  it('throws ArchiveError on failure', () => {
    expect(() =>
      openOutcomeOrThrow({
        ok: false,
        error: { code: 'E_INVALID_ARCHIVE', message: 'Corrupt archive' },
      }),
    ).toThrow(ArchiveError)
  })

  it('throws with correct error code', () => {
    try {
      openOutcomeOrThrow({
        ok: false,
        error: { code: 'E_PASSWORD_REQUIRED', message: 'Password needed' },
      })
      throw new Error('should have thrown')
    } catch (e) {
      if (e instanceof ArchiveError) {
        expect(e.code).toBe('E_PASSWORD_REQUIRED')
        expect(e.message).toBe('Password needed')
      } else {
        throw e
      }
    }
  })

  it('throws E_INTERNAL when error is missing', () => {
    expect(() => openOutcomeOrThrow({ ok: false })).toThrow(ArchiveError)
  })
})

describe('mapExtractionOptions', () => {
  it('maps options with directory destination', () => {
    const result = mapExtractionOptions({
      destination: { kind: 'directory', path: '/tmp/out' },
      entries: ['a.txt'],
      overwrite: 'replace',
    })
    expect(result.destinationKind).toBe('directory')
    expect(result.destinationPath).toBe('/tmp/out')
    expect(result.entries).toEqual(['a.txt'])
    expect(result.overwrite).toBe('replace')
  })

  it('maps options with directory-uri destination', () => {
    const result = mapExtractionOptions({
      destination: { kind: 'directory-uri', uri: 'content://tree/doc/', iosSecurityScope: 'auto' },
      include: ['*.txt'],
      exclude: ['*.tmp'],
    })
    expect(result.destinationKind).toBe('directory-uri')
    expect(result.destinationUri).toBe('content://tree/doc/')
    expect(result.include).toEqual(['*.txt'])
    expect(result.exclude).toEqual(['*.tmp'])
  })

  it('passes through limits', () => {
    const result = mapExtractionOptions({
      destination: { kind: 'directory', path: '/out' },
      limits: { maxEntries: 100, maxCompressionRatio: 500 },
    })
    expect(result.limits).toEqual({
      maxEntries: 100,
      maxTotalUncompressedBytes: undefined,
      maxEntryUncompressedBytes: undefined,
      maxCompressionRatio: 500,
      maxPathDepth: undefined,
      maxPathBytes: undefined,
    })
  })
})

describe('mapCreationOptions', () => {
  it('maps options with file destination', () => {
    const result = mapCreationOptions({
      destination: { kind: 'file', path: '/tmp/out.zip' },
      entries: [
        { kind: 'file', sourcePath: '/tmp/a.txt', archivePath: 'a.txt' },
      ],
      compression: { profile: 'balanced' },
    })
    expect(result.destinationKind).toBe('file')
    expect(result.destinationPath).toBe('/tmp/out.zip')
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]?.kind).toBe('file')
    expect(result.entries[0]?.archivePath).toBe('a.txt')
    expect(result.compressionProfile).toBe('balanced')
  })

  it('maps options with uri destination', () => {
    const result = mapCreationOptions({
      destination: { kind: 'uri', uri: 'content://write/out.zip', iosSecurityScope: 'auto' },
      entries: [],
    })
    expect(result.destinationKind).toBe('uri')
    expect(result.destinationUri).toBe('content://write/out.zip')
  })

  it('maps supported zip encryption options', () => {
    const result = mapCreationOptions({
      destination: { kind: 'file', path: '/tmp/out.zip' },
      entries: [],
      encryption: { method: 'aes-256', password: 'secret' },
    })
    expect(result.encryptionMethod).toBe('aes-256')
    expect(result.encryptionPassword).toBe('secret')
  })

  it('requires a password for zip encryption', () => {
    expect(() =>
      mapCreationOptions({
        destination: { kind: 'file', path: '/tmp/out.zip' },
        entries: [],
        encryption: { method: 'zip-crypto' },
      }),
    ).toThrow(ArchiveError)
  })

  it('rejects encryption methods not creatable on both platforms', () => {
    expect(() =>
      mapCreationOptions({
        destination: { kind: 'file', path: '/tmp/out.zip' },
        entries: [],
        encryption: { method: 'aes-128', password: 'secret' },
      }),
    ).toThrow(ArchiveError)
  })
})

describe('mapExtractionResult', () => {
  it('maps native extraction result', () => {
    const dest = { kind: 'directory' as const, path: '/out' }
    const result = mapExtractionResult(
      {
        operationId: 'ext-1',
        extractedEntries: 10,
        skippedEntries: 2,
        writtenBytes: 50000,
        durationMs: 1500,
        atomicWriteApplied: false,
        warnings: [
          { code: 'W_TIMESTAMP_NOT_PRESERVED', message: 'Could not preserve timestamps' },
        ],
      },
      dest,
    )
    expect(result.operationId).toBe('ext-1')
    expect(result.destination).toBe(dest)
    expect(result.extractedEntries).toBe(10)
    expect(result.skippedEntries).toBe(2)
    expect(result.writtenBytes).toBe(50000n)
    expect(result.durationMs).toBe(1500)
    expect(result.atomicWriteApplied).toBe(false)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]?.code).toBe('W_TIMESTAMP_NOT_PRESERVED')
  })
})

describe('mapCreationResult', () => {
  it('maps native creation result', () => {
    const output = { kind: 'file' as const, path: '/tmp/out.zip' }
    const result = mapCreationResult(
      {
        operationId: 'create-1',
        entryCount: 5,
        inputBytes: 100000,
        outputBytes: 50000,
        durationMs: 2000,
        atomicWriteApplied: true,
        warnings: [],
      },
      output,
    )
    expect(result.operationId).toBe('create-1')
    expect(result.output).toBe(output)
    expect(result.entryCount).toBe(5)
    expect(result.inputBytes).toBe(100000n)
    expect(result.outputBytes).toBe(50000n)
    expect(result.durationMs).toBe(2000)
    expect(result.atomicWriteApplied).toBe(true)
  })
})

describe('mapValidationResult', () => {
  it('maps native validation result', () => {
    const result = mapValidationResult({
      operationId: 'val-1',
      valid: true,
      checkedEntries: 50,
      checkedUncompressedBytes: 1000000,
      encryptedEntries: 0,
      durationMs: 3000,
      issues: [],
    })
    expect(result.operationId).toBe('val-1')
    expect(result.valid).toBe(true)
    expect(result.checkedEntries).toBe(50)
    expect(result.checkedUncompressedBytes).toBe(1000000n)
    expect(result.encryptedEntries).toBe(0)
    expect(result.durationMs).toBe(3000)
    expect(result.issues).toHaveLength(0)
  })

  it('maps validation result with issues', () => {
    const result = mapValidationResult({
      operationId: 'val-2',
      valid: false,
      checkedEntries: 10,
      checkedUncompressedBytes: 5000,
      encryptedEntries: 1,
      durationMs: 500,
      issues: [
        { code: 'E_CHECKSUM_MISMATCH', severity: 'error', message: 'CRC mismatch', entryPath: 'a.txt', entryIndex: 0 },
      ],
    })
    expect(result.valid).toBe(false)
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0]?.code).toBe('E_CHECKSUM_MISMATCH')
    expect(result.issues[0]?.severity).toBe('error')
    expect(result.issues[0]?.entryPath).toBe('a.txt')
  })
})

describe('mapValidationOptions', () => {
  it('maps validate options', () => {
    const result = mapValidationOptions({
      verifyChecksums: false,
      scanAllEntries: true,
      password: 'secret',
      progressIntervalMs: 200,
    })
    expect(result.verifyChecksums).toBe(false)
    expect(result.scanAllEntries).toBe(true)
    expect(result.password).toBe('secret')
    expect(result.progressIntervalMs).toBe(200)
  })

  it('passes undefined for optional fields when not provided', () => {
    const result = mapValidationOptions({})
    expect(result.verifyChecksums).toBeUndefined()
    expect(result.scanAllEntries).toBeUndefined()
    expect(result.password).toBeUndefined()
  })
})

describe('mapOpenOptions', () => {
  it('maps open options without uri options', () => {
    const result = mapOpenOptions({
      password: 'pass',
      maxEntriesToIndex: 1000,
      maxCentralDirectoryBytes: 50000000n,
    })
    expect(result.path.password).toBe('pass')
    expect(result.path.maxEntriesToIndex).toBe(1000)
    expect(result.path.maxCentralDirectoryBytes).toBe(50000000n)
    expect(result.uri.iosSecurityScope).toBeUndefined()
    expect(result.buffer.password).toBe('pass')
  })

  it('maps open options with uri security scope', () => {
    const result = mapOpenOptions(undefined, { iosSecurityScope: 'required' })
    expect(result.path.password).toBeUndefined()
    expect(result.uri.iosSecurityScope).toBe('required')
    expect(result.buffer.password).toBeUndefined()
  })

  it('handles undefined options', () => {
    const result = mapOpenOptions()
    expect(result.path.password).toBeUndefined()
    expect(result.uri.iosSecurityScope).toBeUndefined()
  })
})
