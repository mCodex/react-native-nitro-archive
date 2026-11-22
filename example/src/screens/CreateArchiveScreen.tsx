import { useState, useCallback, useRef } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Keyboard,
  TextInput,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
} from 'react-native'
import { ArchiveFormScrollView } from '../components/ArchiveFormScrollView'
import { useExampleDirectory } from '../exampleDirectory'
import { colors } from '../theme'
import type {
  ArchiveFormat,
  ArchiveTask,
  ArchiveProgress,
  CreationResult,
  ZipCompressionMethod,
  CompressionProfile,
  ZipEncryptionMethod,
} from 'react-native-nitro-archive'
import {
  createArchive,
  fileDestination,
  uriDestination,
  bufferEntry,
} from 'react-native-nitro-archive'
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

const formatDescriptions: Record<ArchiveFormat, string> = {
  zip: 'Compress individual entries and optionally protect them with a password.',
  tar: 'Bundle entries without compression.',
  'tar.gz': 'Compress the entire TAR archive with gzip.',
}

const compressionMethods: ZipCompressionMethod[] = ['store', 'deflate']
const compressionProfiles: CompressionProfile[] = ['fastest', 'balanced', 'smallest']
const encryptionMethods: ZipEncryptionMethod[] = ['none', 'zip-crypto', 'aes-256']

function labelFor(value: string): string {
  switch (value) {
    case 'zip':
    case 'tar':
    case 'tar.gz':
      return value.toUpperCase()
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
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
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
  const directory = useExampleDirectory()
  const { width } = useWindowDimensions()
  const [format, setFormat] = useState<ArchiveFormat>('zip')
  const [customPath, setCustomPath] = useState<string | null>(null)
  const [sampleId, setSampleId] = useState(Date.now)
  const destinationPath = customPath ?? `${directory}/sample-${sampleId}.${format}`
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

  function changeFormat(next: ArchiveFormat) {
    if (state === 'creating' || next === format) return
    setFormat(next)
    setResult(null)
    setError('')
    setProgress(null)
    setState('idle')
  }

  const handleCreate = useCallback(async () => {
    Keyboard.dismiss()
    if (!destinationPath.trim()) {
      Alert.alert('Missing Path', 'Enter an absolute destination path.')
      return
    }
    if (format === 'zip' && selectedEncryption !== 'none' && !password.trim()) {
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
        : fileDestination(destinationPath.trim())

      const textBuffer = stringToArrayBuffer(bufferContent)

      const options = {
        format,
        destination,
        entries: [
          bufferEntry(textBuffer, bufferFileName, {
            compressionMethod: format === 'zip' ? selectedCompression : undefined,
          }),
        ],
        compression: format === 'tar' ? undefined : {
          profile: selectedProfile,
          storeAlreadyCompressed: true,
        },
        encryption: format !== 'zip' || selectedEncryption === 'none' ? undefined : {
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
    format,
    destinationPath,
    bufferFileName,
    bufferContent,
    selectedCompression,
    selectedProfile,
    selectedEncryption,
    password,
  ])

  return (
    <ArchiveFormScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        width >= 720 && styles.contentWide,
      ]}
    >
      <View pointerEvents={state === 'creating' ? 'none' : 'auto'} style={styles.panel}>
        <Text style={styles.sectionTitle}>Archive format</Text>
        <OptionGrid
          value={format}
          values={['zip', 'tar', 'tar.gz']}
          onChange={changeFormat}
        />
        <Text style={styles.helperText}>
          {formatDescriptions[format]}
        </Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Destination</Text>
        <Text style={styles.inputLabel}>Archive path or URI</Text>
        <TextInput
          style={styles.input}
          placeholder={`/path/to/archive.${format}`}
          placeholderTextColor={colors.placeholder}
          value={destinationPath}
          onChangeText={setCustomPath}
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
          placeholderTextColor={colors.placeholder}
          value={bufferFileName}
          onChangeText={setBufferFileName}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={styles.inputLabel}>Buffer content</Text>
        <TextInput
          style={[styles.input, styles.multilineInput]}
          placeholder="File content..."
          placeholderTextColor={colors.placeholder}
          value={bufferContent}
          onChangeText={setBufferContent}
          multiline
          numberOfLines={3}
        />
      </View>

      {format !== 'tar' && (
        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Compression</Text>
          {format === 'zip' && (
            <>
              <Text style={styles.inputLabel}>Method</Text>
              <OptionGrid
                value={selectedCompression}
                values={compressionMethods}
                onChange={setSelectedCompression}
              />
            </>
          )}
          {(format === 'tar.gz' || selectedCompression === 'deflate') && (
            <>
              <Text style={styles.inputLabel}>Profile</Text>
              <OptionGrid
                value={selectedProfile}
                values={compressionProfiles}
                onChange={setSelectedProfile}
              />
            </>
          )}
        </View>
      )}

      {format === 'zip' && (
        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Encryption</Text>
          <OptionGrid
            value={selectedEncryption}
            values={encryptionMethods}
            onChange={setSelectedEncryption}
          />
          {selectedEncryption !== 'none' && (
            <>
              <Text style={styles.inputLabel}>Password</Text>
              <TextInput
                style={styles.input}
                placeholder="Archive password"
                placeholderTextColor={colors.placeholder}
                value={password}
                onChangeText={setPassword}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                secureTextEntry
              />
            </>
          )}
        </View>
      )}

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
          <Text style={styles.resultTitle}>{format.toUpperCase()} archive created</Text>
          <Text selectable style={styles.resultText}>
            {result.output.kind === 'file' ? result.output.path : result.output.uri}
          </Text>
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
          <ActivityIndicator size="large" color={colors.primary} />
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
            setSampleId(Date.now())
            setState('idle')
            setResult(null)
            setProgress(null)
            setError('')
          }}
        >
          <Text style={styles.resetButtonText}>Create Another</Text>
        </TouchableOpacity>
      ) : null}
    </ArchiveFormScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
  panel: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: '700',
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    fontSize: 15,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
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
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 88,
    flexGrow: 1,
    flexShrink: 1,
  },
  optionCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  optionDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.placeholder,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 5,
  },
  optionDotSelected: {
    borderColor: colors.primary,
  },
  optionDotInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  optionLabel: {
    flexShrink: 1,
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '700',
    lineHeight: 18,
  },
  optionLabelSelected: {
    color: colors.primary,
  },
  helperText: {
    color: colors.textSubtle,
    fontSize: 13,
    lineHeight: 18,
    marginTop: -2,
  },
  progressSection: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 16,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  progressPhase: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  progressText: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 6,
  },
  resultCard: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 16,
    marginVertical: 8,
    borderLeftWidth: 3,
    borderLeftColor: colors.success,
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: colors.border,
    borderRightColor: colors.border,
    borderBottomColor: colors.border,
  },
  resultTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  resultText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  errorBanner: {
    backgroundColor: colors.dangerSoft,
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
  },
  creatingOverlay: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  creatingText: {
    color: colors.textMuted,
    fontSize: 15,
    marginTop: 10,
  },
  createButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  createButtonText: {
    color: colors.surface,
    fontSize: 17,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.5,
  },
  resetButton: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  resetButtonText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
})
