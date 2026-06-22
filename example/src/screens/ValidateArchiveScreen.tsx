import React, { useState, useCallback, useRef } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type {
  ArchiveReader,
  ValidationResult,
  ArchiveProgress,
  ArchiveTask,
  ArchiveIssue,
} from '@mcodex/react-native-nitro-archive'
import { openArchive, fileSource, uriSource } from '@mcodex/react-native-nitro-archive'
import { ArchiveInfo } from '../components/ArchiveInfo'
import { ExtractionProgress } from '../components/ExtractionProgress'

function formatBytes(bytes: bigint): string {
  if (bytes < 1024n) return `${bytes.toString()} B`
  if (bytes < 1048576n) return `${(Number(bytes) / 1024).toFixed(1)} KB`
  if (bytes < 1073741824n) return `${(Number(bytes) / 1048576).toFixed(1)} MB`
  return `${(Number(bytes) / 1073741824).toFixed(1)} GB`
}

export function ValidateArchiveScreen() {
  const insets = useSafeAreaInsets()
  const [state, setState] = useState<'idle' | 'loading' | 'loaded' | 'validating' | 'done' | 'error'>('idle')
  const [archivePath, setArchivePath] = useState('')
  const [reader, setReader] = useState<ArchiveReader | null>(null)
  const [result, setResult] = useState<ValidationResult | null>(null)
  const [progress, setProgress] = useState<ArchiveProgress | null>(null)
  const [error, setError] = useState('')
  const taskRef = useRef<ArchiveTask<ValidationResult> | null>(null)

  const handleOpenArchive = useCallback(async () => {
    try {
      setState('loading')
      setError('')
      setReader(null)
      setResult(null)
      setProgress(null)
      taskRef.current?.dispose()

      if (!archivePath.trim()) {
        setError('Enter an archive file path or URI.')
        setState('idle')
        return
      }

      const isUri = archivePath.includes('://')
      const source = isUri ? uriSource(archivePath) : fileSource(archivePath)

      const archiveReader = await openArchive(source)
      setReader(archiveReader)
      setState('loaded')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      setState('error')
    }
  }, [archivePath])

  const handleValidate = useCallback(async () => {
    if (!reader) return
    try {
      setState('validating')
      setError('')
      setResult(null)
      setProgress(null)

      const task = reader.validate({
        verifyChecksums: true,
        scanAllEntries: true,
      })

      taskRef.current = task

      const removeListener = task.onProgress((progress: ArchiveProgress) => {
        setProgress({ ...progress })
      })

      try {
        const validationResult = await task.start()
        setResult(validationResult)
        setState('done')
      } finally {
        removeListener()
        task.dispose()
        taskRef.current = null
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      setState('error')
    }
  }, [reader])

  const handleClose = useCallback(() => {
    reader?.dispose()
    setReader(null)
    setResult(null)
    setProgress(null)
    setState('idle')
  }, [reader])

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top }]}
      contentContainerStyle={styles.content}
    >
      {state === 'idle' ? (
        <View style={styles.centeredSection}>
          <TextInput
            style={styles.input}
            placeholder="/path/to/archive.zip"
            placeholderTextColor="#C7C7CC"
            value={archivePath}
            onChangeText={setArchivePath}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity style={styles.primaryButton} onPress={handleOpenArchive}>
            <Text style={styles.primaryButtonText}>Open Archive</Text>
          </TouchableOpacity>
          <Text style={styles.hint}>
            Enter a path or URI to a .zip file to validate its integrity
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
          <TouchableOpacity style={styles.retryButton} onPress={() => setState('idle')}>
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

          {progress ? (
            <ExtractionProgress progress={progress} />
          ) : null}

          {result ? (
            <View style={styles.resultCard}>
              <View
                style={[
                  styles.statusBadge,
                  result.valid ? styles.statusPass : styles.statusFail,
                ]}
              >
                <Text style={styles.statusText}>
                  {result.valid ? 'PASSED' : 'FAILED'}
                </Text>
              </View>

              <View style={styles.statsRow}>
                <StatItem label="Checked" value={result.checkedEntries.toString()} />
                <StatItem
                  label="Uncompressed"
                  value={formatBytes(result.checkedUncompressedBytes)}
                />
                <StatItem label="Encrypted" value={result.encryptedEntries.toString()} />
                <StatItem
                  label="Duration"
                  value={`${(result.durationMs / 1000).toFixed(1)}s`}
                />
              </View>

              {result.issues.length > 0 ? (
                <View style={styles.issuesSection}>
                  <Text style={styles.issuesHeader}>
                    Issues ({result.issues.length})
                  </Text>
                  {result.issues.map((issue, i) => (
                    <IssueRow key={i} issue={issue} />
                  ))}
                </View>
              ) : (
                <View style={styles.noIssues}>
                  <Text style={styles.noIssuesText}>No issues found</Text>
                </View>
              )}
            </View>
          ) : null}

          <View style={styles.actionGroup}>
            {state !== 'done' ? (
              <TouchableOpacity
                style={[
                  styles.validateButton,
                  state === 'validating' && styles.disabledButton,
                ]}
                onPress={handleValidate}
                disabled={state === 'validating'}
              >
                <Text style={styles.validateButtonText}>
                  {state === 'validating' ? 'Validating...' : 'Run Validation'}
                </Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
              <Text style={styles.closeButtonText}>
                {state === 'done' ? 'Validate Another' : 'Close Archive'}
              </Text>
            </TouchableOpacity>
          </View>
        </>
      ) : null}
    </ScrollView>
  )
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statItem}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

function IssueRow({ issue }: { issue: ArchiveIssue }) {
  return (
    <View style={styles.issueRow}>
      <View
        style={[
          styles.issueDot,
          issue.severity === 'error' ? styles.issueDotError : styles.issueDotWarning,
        ]}
      />
      <View style={styles.issueContent}>
        <Text style={styles.issueCode}>{issue.code}</Text>
        <Text style={styles.issueMessage}>{issue.message}</Text>
        {issue.entryPath ? (
          <Text style={styles.issuePath}>{issue.entryPath}</Text>
        ) : null}
      </View>
    </View>
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
    width: '100%',
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
  statusBadge: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  statusPass: {
    backgroundColor: '#E8F8E8',
  },
  statusFail: {
    backgroundColor: '#FFF0F0',
  },
  statusText: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 1,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  statLabel: {
    fontSize: 11,
    color: '#8E8E93',
    marginTop: 2,
  },
  issuesSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E5EA',
    paddingTop: 12,
  },
  issuesHeader: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF3B30',
    marginBottom: 8,
  },
  issueRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  issueDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
    marginRight: 10,
  },
  issueDotError: {
    backgroundColor: '#FF3B30',
  },
  issueDotWarning: {
    backgroundColor: '#FF9500',
  },
  issueContent: {
    flex: 1,
  },
  issueCode: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3C3C43',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  issueMessage: {
    fontSize: 13,
    color: '#3C3C43',
    marginTop: 2,
    lineHeight: 18,
  },
  issuePath: {
    fontSize: 11,
    color: '#8E8E93',
    marginTop: 2,
  },
  noIssues: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  noIssuesText: {
    fontSize: 15,
    color: '#34C759',
    fontWeight: '600',
  },
  actionGroup: {
    marginTop: 16,
    gap: 10,
  },
  validateButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  validateButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.5,
  },
  closeButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  closeButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
})
