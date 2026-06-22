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
  ArchiveTask,
  ArchiveProgress,
  CreationResult,
  ZipCompressionMethod,
  CompressionProfile,
} from '@mcodex/react-native-nitro-archive'
import {
  createArchive,
  fileDestination,
  bufferEntry,
  bufferSource,
} from '@mcodex/react-native-nitro-archive'
import { ProgressBar } from '../components/ProgressBar'

function stringToArrayBuffer(str: string): ArrayBuffer {
  const buf = new Uint8Array(str.length)
  for (let i = 0; i < str.length; i++) {
    buf[i] = str.charCodeAt(i) & 0xff
  }
  return buf.buffer
}

function formatBytes(bytes: bigint | number): string {
  const b = typeof bytes === 'number' ? BigInt(Math.round(bytes)) : bytes
  if (b < 1024n) return `${b.toString()} B`
  if (b < 1048576n) return `${(Number(b) / 1024).toFixed(1)} KB`
  if (b < 1073741824n) return `${(Number(b) / 1048576).toFixed(1)} MB`
  return `${(Number(b) / 1073741824).toFixed(1)} GB`
}

const compressionMethods: ZipCompressionMethod[] = ['store', 'deflate']
const compressionProfiles: CompressionProfile[] = ['fastest', 'balanced', 'smallest']

export function CreateArchiveScreen() {
  const insets = useSafeAreaInsets()
  const [destinationPath, setDestinationPath] = useState('')
  const [bufferFileName, setBufferFileName] = useState('hello.txt')
  const [bufferContent, setBufferContent] = useState('Hello from Nitro Archive!')
  const [selectedCompression, setSelectedCompression] = useState<ZipCompressionMethod>('deflate')
  const [selectedProfile, setSelectedProfile] = useState<CompressionProfile>('balanced')
  const [state, setState] = useState<'idle' | 'creating' | 'done' | 'error'>('idle')
  const [progress, setProgress] = useState<ArchiveProgress | null>(null)
  const [result, setResult] = useState<CreationResult | null>(null)
  const [error, setError] = useState('')
  const taskRef = useRef<ArchiveTask<CreationResult> | null>(null)

  const handleCreate = useCallback(async () => {
    if (!destinationPath.trim()) {
      Alert.alert('Missing Path', 'Enter an absolute destination path.')
      return
    }

    try {
      setState('creating')
      setError('')
      setResult(null)
      setProgress(null)

      const isUri = destinationPath.includes('://')
      const destination = isUri
        ? fileDestination(destinationPath)
        : fileDestination(
            destinationPath.startsWith('/')
              ? destinationPath
              : `/${destinationPath}`,
          )

      const textBuffer = stringToArrayBuffer(bufferContent)

      const options = {
        destination,
        entries: [
          bufferEntry(textBuffer, bufferFileName, {
            compressionMethod: selectedCompression,
          }),
        ],
        compression: {
          profile: selectedProfile,
          storeAlreadyCompressed: true,
        },
      }

      const task = createArchive(options)
      taskRef.current = task

      const removeListener = task.onProgress((p) => {
        setProgress({ ...p })
      })

      try {
        const creationResult = await task.start()
        setResult(creationResult)
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
  }, [destinationPath, bufferFileName, bufferContent, selectedCompression, selectedProfile])

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.sectionTitle}>Destination</Text>

      <Text style={styles.inputLabel}>Archive Path</Text>
      <TextInput
        style={styles.input}
        placeholder="/tmp/my-archive.zip"
        placeholderTextColor="#C7C7CC"
        value={destinationPath}
        onChangeText={setDestinationPath}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Text style={styles.sectionTitle}>Entries</Text>

      <Text style={styles.inputLabel}>Buffer File Name</Text>
      <TextInput
        style={styles.input}
        placeholder="hello.txt"
        placeholderTextColor="#C7C7CC"
        value={bufferFileName}
        onChangeText={setBufferFileName}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Text style={styles.inputLabel}>Buffer Content</Text>
      <TextInput
        style={[styles.input, styles.multilineInput]}
        placeholder="File content..."
        placeholderTextColor="#C7C7CC"
        value={bufferContent}
        onChangeText={setBufferContent}
        multiline
        numberOfLines={3}
      />

      <Text style={styles.sectionTitle}>Compression Method</Text>
      <View style={styles.radioGroup}>
        {compressionMethods.map((method) => (
          <TouchableOpacity
            key={method}
            style={[
              styles.radioOption,
              selectedCompression === method && styles.radioOptionSelected,
            ]}
            onPress={() => setSelectedCompression(method)}
          >
            <View style={styles.radioCircle}>
              {selectedCompression === method ? (
                <View style={styles.radioCircleFilled} />
              ) : null}
            </View>
            <Text
              style={[
                styles.radioLabel,
                selectedCompression === method && styles.radioLabelSelected,
              ]}
            >
              {method.charAt(0).toUpperCase() + method.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Compression Profile</Text>
      <View style={styles.radioGroup}>
        {compressionProfiles.map((profile) => (
          <TouchableOpacity
            key={profile}
            style={[
              styles.radioOption,
              selectedProfile === profile && styles.radioOptionSelected,
            ]}
            onPress={() => setSelectedProfile(profile)}
          >
            <View style={styles.radioCircle}>
              {selectedProfile === profile ? (
                <View style={styles.radioCircleFilled} />
              ) : null}
            </View>
            <Text
              style={[
                styles.radioLabel,
                selectedProfile === profile && styles.radioLabelSelected,
              ]}
            >
              {profile.charAt(0).toUpperCase() + profile.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {progress ? (
        <View style={styles.progressSection}>
          <Text style={styles.progressPhase}>
            Phase: {progress.phase}
          </Text>
          <ProgressBar progress={progress.percentage ?? 0} />
          <Text style={styles.progressText}>
            {progress.processedEntries > 0
              ? `Entries: ${progress.processedEntries}`
              : ''}
            {progress.totalEntries !== undefined && progress.totalEntries > 0
              ? ` / ${progress.totalEntries}`
              : ''}
          </Text>
        </View>
      ) : null}

      {result ? (
        <View style={styles.resultCard}>
          <Text style={styles.resultTitle}>Archive Created</Text>
          <Text style={styles.resultText}>
            Entries: {result.entryCount}
          </Text>
          <Text style={styles.resultText}>
            Input: {formatBytes(result.inputBytes)}
          </Text>
          <Text style={styles.resultText}>
            Output: {formatBytes(result.outputBytes)}
          </Text>
          <Text style={styles.resultText}>
            Duration: {(result.durationMs / 1000).toFixed(1)}s
          </Text>
          <Text style={styles.resultText}>
            Atomic write:{' '}
            {result.atomicWriteApplied ? 'Yes' : 'No'}
          </Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {state === 'creating' ? (
        <View style={styles.creatingOverlay}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.creatingText}>Creating archive...</Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={[
          styles.createButton,
          state === 'creating' && styles.disabledButton,
        ]}
        onPress={handleCreate}
        disabled={state === 'creating'}
      >
        <Text style={styles.createButtonText}>
          {state === 'creating' ? 'Creating...' : 'Create Archive'}
        </Text>
      </TouchableOpacity>

      {state === 'done' ? (
        <TouchableOpacity
          style={styles.resetButton}
          onPress={() => {
            setState('idle')
            setResult(null)
            setProgress(null)
            setError('')
          }}
        >
          <Text style={styles.resetButtonText}>Create Another</Text>
        </TouchableOpacity>
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
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1C1C1E',
    marginTop: 20,
    marginBottom: 8,
  },
  inputLabel: {
    fontSize: 14,
    color: '#3C3C43',
    fontWeight: '500',
    marginBottom: 6,
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
    marginBottom: 8,
  },
  multilineInput: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  radioGroup: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  radioOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    flex: 1,
  },
  radioOptionSelected: {
    borderColor: '#007AFF',
    backgroundColor: '#F0F8FF',
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#C7C7CC',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  radioCircleFilled: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#007AFF',
  },
  radioLabel: {
    fontSize: 14,
    color: '#3C3C43',
    fontWeight: '500',
  },
  radioLabelSelected: {
    color: '#007AFF',
  },
  progressSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginVertical: 12,
  },
  progressPhase: {
    fontSize: 13,
    fontWeight: '600',
    color: '#007AFF',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  progressText: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 6,
  },
  resultCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#34C759',
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
  errorBanner: {
    backgroundColor: '#FFF2F0',
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#FFC7C2',
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 14,
    lineHeight: 20,
  },
  creatingOverlay: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  creatingText: {
    color: '#8E8E93',
    fontSize: 15,
    marginTop: 10,
  },
  createButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  createButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.5,
  },
  resetButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  resetButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
})
