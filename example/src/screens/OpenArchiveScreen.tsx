import React, { useState, useCallback, useRef } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type {
  ArchiveReader,
  ArchiveEntry,
  ArchiveEntryPage,
  ExtractionResult,
  ValidationResult,
  ArchiveProgress,
  ArchiveTask,
} from '@mcodex/react-native-nitro-archive'
import {
  openArchive,
  fileSource,
  uriSource,
  directoryDestination,
  directoryUriDestination,
} from '@mcodex/react-native-nitro-archive'
import { ArchiveInfo } from '../components/ArchiveInfo'
import { ProgressBar } from '../components/ProgressBar'
import { ExtractionProgress } from '../components/ExtractionProgress'

type ScreenState = 'idle' | 'loading' | 'loaded' | 'listing' | 'extracting' | 'validating' | 'reading' | 'error'

function formatBytes(bytes: bigint): string {
  if (bytes < 1024n) return `${bytes.toString()} B`
  if (bytes < 1048576n) return `${(Number(bytes) / 1024).toFixed(1)} KB`
  if (bytes < 1073741824n) return `${(Number(bytes) / 1048576).toFixed(1)} MB`
  return `${(Number(bytes) / 1073741824).toFixed(1)} GB`
}

export function OpenArchiveScreen() {
  const insets = useSafeAreaInsets()
  const [state, setState] = useState<ScreenState>('idle')
  const [archiveUri, setArchiveUri] = useState<string>('')
  const [password, setPassword] = useState<string>('')
  const [archiveName, setArchiveName] = useState<string>('')
  const [reader, setReader] = useState<ArchiveReader | null>(null)
  const [entryPage, setEntryPage] = useState<ArchiveEntryPage | null>(null)
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null)
  const [extractPath, setExtractPath] = useState<string>('')
  const [extractionResult, setExtractionResult] = useState<ExtractionResult | null>(null)
  const [extractionProgress, setExtractionProgress] = useState<ArchiveProgress | null>(null)
  const [validationProgress, setValidationProgress] = useState<ArchiveProgress | null>(null)
  const [showEntries, setShowEntries] = useState(false)
  const [error, setError] = useState<string>('')
  const extractTaskRef = useRef<ArchiveTask<ExtractionResult> | null>(null)
  const validateTaskRef = useRef<ArchiveTask<ValidationResult> | null>(null)

  const handleOpenArchive = useCallback(async () => {
    try {
      setState('loading')
      setError('')
      setReader(null)
      setEntryPage(null)
      setValidationResult(null)
      setExtractionResult(null)
      setExtractionProgress(null)
      setValidationProgress(null)
      setShowEntries(false)
      extractTaskRef.current?.dispose()
      validateTaskRef.current?.dispose()

      if (!archiveUri.trim()) {
        setError('Enter an archive file path or URI.')
        setState('idle')
        return
      }

      const isUri = archiveUri.includes('://')
      const source = isUri ? uriSource(archiveUri) : fileSource(archiveUri)
      setArchiveName(archiveUri.split('/').pop() ?? 'archive.zip')

      const archiveReader = await openArchive(source, { password: password || undefined })
      setReader(archiveReader)
      setState('loaded')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      setState('error')
    }
  }, [archiveUri, password])

  const handleListEntries = useCallback(async () => {
    if (!reader) return
    try {
      setState('listing')
      setShowEntries(true)
      const page = await reader.listEntries({ limit: 50 })
      setEntryPage(page)
      setState('loaded')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      setState('error')
    }
  }, [reader])

  const handleExtract = useCallback(async () => {
    if (!reader || !extractPath.trim()) {
      Alert.alert('Missing Path', 'Enter an absolute destination path.')
      return
    }
    try {
      setState('extracting')
      setError('')
      setExtractionResult(null)
      setExtractionProgress(null)

      const isUri = extractPath.includes('://')
      const destination = isUri
        ? directoryUriDestination(extractPath)
        : directoryDestination(extractPath)

      const task = reader.extract({
        destination,
        overwrite: 'replace',
      })

      extractTaskRef.current = task

      const removeListener = task.onProgress((progress: ArchiveProgress) => {
        setExtractionProgress({ ...progress })
      })

      try {
        const result = await task.start()
        setExtractionResult(result)
        setState('loaded')
      } finally {
        removeListener()
        task.dispose()
        extractTaskRef.current = null
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      setState('loaded')
    }
  }, [reader, extractPath])

  const handleValidate = useCallback(async () => {
    if (!reader) return
    try {
      setState('validating')
      setError('')
      setValidationResult(null)
      setValidationProgress(null)

      const task = reader.validate({
        verifyChecksums: true,
        scanAllEntries: true,
      })

      validateTaskRef.current = task

      const removeListener = task.onProgress((progress: ArchiveProgress) => {
        setValidationProgress({ ...progress })
      })

      try {
        const result = await task.start()
        setValidationResult(result)
        setState('loaded')
      } finally {
        removeListener()
        task.dispose()
        validateTaskRef.current = null
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      setState('loaded')
    }
  }, [reader])

  const handleReadEntry = useCallback(async () => {
    if (!reader || !entryPage) return
    const fileEntry = entryPage.entries.find((e) => e.kind === 'file')
    if (!fileEntry) {
      Alert.alert('No File Entry', 'No file entries available to read.')
      return
    }
    try {
      setState('reading')
      const buffer = await reader.readEntry(fileEntry.path, {
        maxBytes: 10485760n,
      })
      const sizeStr = formatBytes(BigInt(buffer.byteLength))
      Alert.alert(
        'Entry Read',
        `"${fileEntry.path}"\nSize: ${sizeStr}`,
      )
      setState('loaded')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      Alert.alert('Read Failed', message)
      setState('loaded')
    }
  }, [reader, entryPage])

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {state === 'idle' || !reader ? (
        <View style={styles.centeredSection}>
          <TextInput
            style={styles.input}
            placeholder="/path/to/archive.zip"
            placeholderTextColor="#C7C7CC"
            value={archiveUri}
            onChangeText={setArchiveUri}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            style={styles.input}
            placeholder="Password (optional, for encrypted archives)"
            placeholderTextColor="#C7C7CC"
            value={password}
            onChangeText={setPassword}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleOpenArchive}
          >
            <Text style={styles.primaryButtonText}>Open Archive</Text>
          </TouchableOpacity>
          <Text style={styles.hint}>
            Enter a path or URI to a .zip file to inspect, extract, or validate
          </Text>
        </View>
      ) : null}

      {state === 'loading' ? (
        <View style={styles.centeredSection}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Opening archive...</Text>
        </View>
      ) : null}

      {state === 'error' && error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => {
              setError('')
              setState('idle')
            }}
          >
            <Text style={styles.retryButtonText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {reader && state !== 'loading' ? (
        <>
          <ArchiveInfo
            format={reader.format}
            entryCount={reader.entryCount}
            compressedSize={reader.compressedSize}
            totalUncompressedSize={reader.totalUncompressedSize}
            encrypted={reader.encrypted}
            comment={reader.comment}
          />

          {extractionProgress ? (
            <ExtractionProgress progress={extractionProgress} />
          ) : null}

          {validationProgress ? (
            <ExtractionProgress progress={validationProgress} />
          ) : null}

          {extractionResult ? (
            <View style={styles.resultCard}>
              <Text style={styles.resultTitle}>Extraction Complete</Text>
              <Text style={styles.resultText}>
                Extracted: {extractionResult.extractedEntries} entries
              </Text>
              <Text style={styles.resultText}>
                Skipped: {extractionResult.skippedEntries} entries
              </Text>
              <Text style={styles.resultText}>
                Written: {formatBytes(extractionResult.writtenBytes)}
              </Text>
              <Text style={styles.resultText}>
                Duration: {(extractionResult.durationMs / 1000).toFixed(1)}s
              </Text>
            </View>
          ) : null}

          {validationResult ? (
            <View
              style={[
                styles.resultCard,
                validationResult.valid
                  ? { borderLeftColor: '#34C759', borderLeftWidth: 3 }
                  : { borderLeftColor: '#FF3B30', borderLeftWidth: 3 },
              ]}
            >
              <Text style={styles.resultTitle}>
                Validation: {validationResult.valid ? 'PASSED' : 'FAILED'}
              </Text>
              <Text style={styles.resultText}>
                Checked: {validationResult.checkedEntries} entries
              </Text>
              <Text style={styles.resultText}>
                Encrypted: {validationResult.encryptedEntries} entries
              </Text>
              {(validationResult.checkedUncompressedBytes ?? 0n) > 0n ? (
                <Text style={styles.resultText}>
                  Uncompressed:{' '}
                  {formatBytes(validationResult.checkedUncompressedBytes)}
                </Text>
              ) : null}
              <Text style={styles.resultText}>
                Duration: {(validationResult.durationMs / 1000).toFixed(1)}s
              </Text>
              {validationResult.issues.length > 0 ? (
                <View style={styles.issuesList}>
                  <Text style={styles.issuesTitle}>Issues:</Text>
                  {validationResult.issues.map((issue, i) => (
                    <Text key={i} style={styles.issueItem}>
                      [{issue.severity}] {issue.code}: {issue.message}
                      {issue.entryPath ? ` (${issue.entryPath})` : ''}
                    </Text>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}

          <View style={styles.actionGroup}>
            <Text style={styles.sectionTitle}>Actions</Text>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleListEntries}
              disabled={state === 'listing'}
            >
              <Text style={styles.actionButtonText}>
                {state === 'listing' ? 'Loading...' : 'List Entries'}
              </Text>
            </TouchableOpacity>

            {showEntries && entryPage ? (
              <View style={styles.entriesCard}>
                <Text style={styles.entriesHeader}>
                  Entries ({entryPage.totalEntries} total, showing {entryPage.entries.length})
                </Text>
                {entryPage.entries.length === 0 ? (
                  <Text style={styles.noEntries}>No entries found</Text>
                ) : (
                  entryPage.entries.map((entry) => (
                    <View key={entry.index} style={styles.entryRow}>
                      <View style={styles.entryInfo}>
                        <Text style={styles.entryPath} numberOfLines={1}>
                          {entry.path}
                        </Text>
                        <View style={styles.entryMeta}>
                          <Text style={styles.entryBadge}>{entry.kind}</Text>
                          <Text style={styles.entrySize}>
                            {formatBytes(entry.uncompressedSize)}
                          </Text>
                          {entry.encrypted ? (
                            <Text style={styles.entryBadge}>🔒</Text>
                          ) : null}
                        </View>
                      </View>
                    </View>
                  ))
                )}
                <TouchableOpacity
                  style={styles.readEntryButton}
                  onPress={handleReadEntry}
                  disabled={state === 'reading'}
                >
                  <Text style={styles.readEntryButtonText}>
                    {state === 'reading' ? 'Reading...' : 'Read First File Entry'}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <Text style={styles.inputLabel}>Extract Destination Path</Text>
            <TextInput
              style={styles.input}
              placeholder="/path/to/extract/directory"
              placeholderTextColor="#C7C7CC"
              value={extractPath}
              onChangeText={setExtractPath}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <TouchableOpacity
              style={[
                styles.actionButton,
                state === 'extracting' && styles.disabledButton,
              ]}
              onPress={handleExtract}
              disabled={state === 'extracting'}
            >
              <Text style={styles.actionButtonText}>
                {state === 'extracting' ? 'Extracting...' : 'Extract'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.actionButton,
                state === 'validating' && styles.disabledButton,
              ]}
              onPress={handleValidate}
              disabled={state === 'validating'}
            >
              <Text style={styles.actionButtonText}>
                {state === 'validating' ? 'Validating...' : 'Validate'}
              </Text>
            </TouchableOpacity>

            {state !== 'idle' ? (
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => {
                  reader.dispose()
                  setReader(null)
                  setEntryPage(null)
                  setValidationResult(null)
                  setExtractionResult(null)
                  setExtractionProgress(null)
                  setValidationProgress(null)
                  setShowEntries(false)
                  setState('idle')
                }}
              >
                <Text style={styles.secondaryButtonText}>Close Archive</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </>
      ) : null}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  centeredSection: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  primaryButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 32,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  hint: {
    color: '#8E8E93',
    fontSize: 14,
    marginTop: 16,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  loadingText: {
    color: '#8E8E93',
    fontSize: 15,
    marginTop: 12,
  },
  errorBanner: {
    backgroundColor: '#FFF2F0',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FFC7C2',
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 14,
    lineHeight: 20,
  },
  retryButton: {
    marginTop: 10,
    alignSelf: 'flex-end',
  },
  retryButtonText: {
    color: '#007AFF',
    fontSize: 15,
    fontWeight: '600',
  },
  actionGroup: {
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 12,
  },
  actionButton: {
    backgroundColor: '#007AFF',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.5,
  },
  secondaryButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  secondaryButtonText: {
    color: '#FF3B30',
    fontSize: 16,
    fontWeight: '600',
  },
  inputLabel: {
    fontSize: 15,
    color: '#3C3C43',
    fontWeight: '500',
    marginBottom: 6,
    marginTop: 4,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 15,
    color: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    marginBottom: 10,
  },
  resultCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  resultTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 8,
  },
  resultText: {
    fontSize: 14,
    color: '#3C3C43',
    marginBottom: 4,
  },
  issuesList: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E5EA',
  },
  issuesTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF3B30',
    marginBottom: 4,
  },
  issueItem: {
    fontSize: 12,
    color: '#3C3C43',
    lineHeight: 18,
    marginBottom: 2,
  },
  entriesCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    maxHeight: 300,
  },
  entriesHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
    marginBottom: 8,
  },
  noEntries: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    paddingVertical: 20,
  },
  entryRow: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  entryInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  entryPath: {
    fontSize: 13,
    color: '#1C1C1E',
    flex: 1,
    marginRight: 8,
  },
  entryMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  entryBadge: {
    fontSize: 11,
    color: '#8E8E93',
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  entrySize: {
    fontSize: 12,
    color: '#3C3C43',
    fontWeight: '500',
  },
  readEntryButton: {
    marginTop: 10,
    backgroundColor: '#F2F2F7',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  readEntryButtonText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '600',
  },
})
