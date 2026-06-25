import { useState, useCallback, useRef } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type {
  ArchiveTask,
  ArchiveProgress,
  CreationResult,
  ZipCompressionMethod,
  CompressionProfile,
  ZipEncryptionMethod,
} from '@mcodex/react-native-nitro-archive'
import {
  createArchive,
  fileDestination,
  uriDestination,
  bufferEntry,
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
const encryptionMethods: ZipEncryptionMethod[] = ['none', 'zip-crypto', 'aes-256']

function labelFor(value: string): string {
  switch (value) {
    case 'zip-crypto':
      return 'ZipCrypto'
    case 'aes-256':
      return 'AES-256'
    case 'none':
      return 'None'
    default:
      return value.charAt(0).toUpperCase() + value.slice(1)
  }
}

function OptionGrid<T extends string>({
  value,
  values,
  onChange,
}: {
  value: T
  values: readonly T[]
  onChange: (value: T) => void
}) {
  return (
    <View style={styles.optionGrid}>
      {values.map((item) => {
        const selected = value === item
        return (
          <TouchableOpacity
            key={item}
            style={[styles.optionCard, selected && styles.optionCardSelected]}
            onPress={() => onChange(item)}
            activeOpacity={0.78}
          >
            <View style={[styles.optionDot, selected && styles.optionDotSelected]}>
              {selected ? <View style={styles.optionDotInner} /> : null}
            </View>
            <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>
              {labelFor(item)}
            </Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

export function CreateArchiveScreen() {
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const [destinationPath, setDestinationPath] = useState('')
  const [bufferFileName, setBufferFileName] = useState('hello.txt')
  const [bufferContent, setBufferContent] = useState('Hello from Nitro Archive!')
  const [selectedCompression, setSelectedCompression] = useState<ZipCompressionMethod>('deflate')
  const [selectedProfile, setSelectedProfile] = useState<CompressionProfile>('balanced')
  const [selectedEncryption, setSelectedEncryption] = useState<ZipEncryptionMethod>('none')
  const [password, setPassword] = useState('')
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
    if (selectedEncryption !== 'none' && !password.trim()) {
      Alert.alert('Missing Password', 'Enter a password or choose no encryption.')
      return
    }

    try {
      setState('creating')
      setError('')
      setResult(null)
      setProgress(null)

      const isUri = destinationPath.includes('://')
      const destination = isUri
        ? uriDestination(destinationPath)
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
        encryption: selectedEncryption === 'none' ? undefined : {
          method: selectedEncryption,
          password,
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
  }, [
    destinationPath,
    bufferFileName,
    bufferContent,
    selectedCompression,
    selectedProfile,
    selectedEncryption,
    password,
  ])

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top }]}
      contentContainerStyle={[
        styles.content,
        width >= 720 && styles.contentWide,
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>ZIP builder</Text>
        <Text style={styles.title}>Create archive</Text>
        <Text style={styles.subtitle}>
          Package one buffer entry, choose compression, and test encrypted ZIP creation.
        </Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Destination</Text>
        <Text style={styles.inputLabel}>Archive path or URI</Text>
        <TextInput
          style={styles.input}
          placeholder="/tmp/my-archive.zip"
          placeholderTextColor="#9CA3AF"
          value={destinationPath}
          onChangeText={setDestinationPath}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Entry</Text>
        <Text style={styles.inputLabel}>Buffer file name</Text>
        <TextInput
          style={styles.input}
          placeholder="hello.txt"
          placeholderTextColor="#9CA3AF"
          value={bufferFileName}
          onChangeText={setBufferFileName}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={styles.inputLabel}>Buffer content</Text>
        <TextInput
          style={[styles.input, styles.multilineInput]}
          placeholder="File content..."
          placeholderTextColor="#9CA3AF"
          value={bufferContent}
          onChangeText={setBufferContent}
          multiline
          numberOfLines={3}
        />
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Compression</Text>
        <Text style={styles.inputLabel}>Method</Text>
        <OptionGrid
          value={selectedCompression}
          values={compressionMethods}
          onChange={setSelectedCompression}
        />

        <Text style={styles.inputLabel}>Profile</Text>
        <OptionGrid
          value={selectedProfile}
          values={compressionProfiles}
          onChange={setSelectedProfile}
        />
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Password</Text>
        <Text style={styles.inputLabel}>Encryption</Text>
        <OptionGrid
          value={selectedEncryption}
          values={encryptionMethods}
          onChange={setSelectedEncryption}
        />
        {selectedEncryption !== 'none' ? (
          <>
            <Text style={styles.inputLabel}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="Archive password"
              placeholderTextColor="#9CA3AF"
              value={password}
              onChangeText={setPassword}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
            />
          </>
        ) : null}
        <Text style={styles.helperText}>
          Encrypted archives still use the same size, path, and bomb limits.
        </Text>
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
          <ActivityIndicator size="large" color="#1D7A8C" />
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
    backgroundColor: '#F5F7FA',
  },
  content: {
    padding: 18,
    paddingBottom: 40,
  },
  contentWide: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  hero: {
    paddingTop: 8,
    paddingBottom: 18,
  },
  eyebrow: {
    color: '#52677A',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  title: {
    color: '#101820',
    fontSize: 30,
    fontWeight: '800',
    marginBottom: 8,
  },
  subtitle: {
    color: '#52677A',
    fontSize: 15,
    lineHeight: 21,
  },
  panel: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#DDE5EC',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#101820',
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 13,
    color: '#52677A',
    fontWeight: '700',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    fontSize: 15,
    color: '#101820',
    borderWidth: 1,
    borderColor: '#DDE5EC',
    marginBottom: 12,
  },
  multilineInput: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#DDE5EC',
    minWidth: 132,
    flexGrow: 1,
    flexShrink: 1,
  },
  optionCardSelected: {
    borderColor: '#1D7A8C',
    backgroundColor: '#EAF7FA',
  },
  optionDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#9CA3AF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  optionDotSelected: {
    borderColor: '#1D7A8C',
  },
  optionDotInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#1D7A8C',
  },
  optionLabel: {
    flex: 1,
    fontSize: 14,
    color: '#334155',
    fontWeight: '700',
    lineHeight: 18,
  },
  optionLabelSelected: {
    color: '#0F5E6D',
  },
  helperText: {
    color: '#64748B',
    fontSize: 13,
    lineHeight: 18,
    marginTop: -2,
  },
  progressSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 16,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: '#DDE5EC',
  },
  progressPhase: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1D7A8C',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  progressText: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 6,
  },
  resultCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 16,
    marginVertical: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#2FA36B',
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: '#DDE5EC',
    borderRightColor: '#DDE5EC',
    borderBottomColor: '#DDE5EC',
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
    backgroundColor: '#1D7A8C',
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
    shadowColor: '#1D7A8C',
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
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  resetButtonText: {
    color: '#1D7A8C',
    fontSize: 16,
    fontWeight: '600',
  },
})
