import React, { useState, useCallback } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '../theme'
import type {
  ArchiveAccessMode,
  ArchiveAccessReport,
  ArchiveRecoveryAction,
} from 'react-native-nitro-archive'
import { checkArchiveAccess, fileSource } from 'react-native-nitro-archive'

const modes: { label: string; value: ArchiveAccessMode }[] = [
  { label: 'Read', value: 'read' },
  { label: 'Write', value: 'write' },
  { label: 'Create Children', value: 'create-children' },
]

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text
        style={[styles.infoValue, value === 'Yes' ? styles.positive : value === 'No' ? styles.negative : null]}
      >
        {value}
      </Text>
    </View>
  )
}

function recoveryActionLabel(action: ArchiveRecoveryAction): string {
  switch (action) {
    case 'none': return 'None needed'
    case 'choose-document': return 'Choose a document'
    case 'choose-directory': return 'Choose a directory'
    case 'reselect-document': return 'Reselect the document'
    case 'grant-read-access': return 'Grant read access'
    case 'grant-write-access': return 'Grant write access'
    case 'download-from-provider': return 'Download from provider'
    case 'move-into-app-storage': return 'Move into app storage'
    case 'use-content-uri': return 'Use a content URI'
  }
}

export function AccessPreflightScreen() {
  const insets = useSafeAreaInsets()
  const [path, setPath] = useState('')
  const [selectedMode, setSelectedMode] = useState<ArchiveAccessMode>('read')
  const [state, setState] = useState<'idle' | 'checking' | 'done' | 'error'>('idle')
  const [report, setReport] = useState<ArchiveAccessReport | null>(null)
  const [error, setError] = useState('')

  const handleCheck = useCallback(async () => {
    if (!path.trim()) return

    try {
      setState('checking')
      setError('')
      setReport(null)

      const result = await checkArchiveAccess(
        fileSource(path),
        selectedMode,
      )

      setReport(result)
      setState('done')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      setState('error')
    }
  }, [path, selectedMode])

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.sectionTitle}>Target Path or URI</Text>
      <TextInput
        style={styles.input}
        placeholder="/path/to/file or content://..."
        placeholderTextColor={colors.placeholder}
        value={path}
        onChangeText={setPath}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Text style={styles.sectionTitle}>Access Mode</Text>
      <View style={styles.modesRow}>
        {modes.map((mode) => (
          <TouchableOpacity
            key={mode.value}
            style={[
              styles.modeOption,
              selectedMode === mode.value && styles.modeOptionSelected,
            ]}
            onPress={() => setSelectedMode(mode.value)}
          >
            <Text
              style={[
                styles.modeLabel,
                selectedMode === mode.value && styles.modeLabelSelected,
              ]}
            >
              {mode.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {state === 'checking' ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.checkingText}>Checking access...</Text>
        </View>
      ) : null}

      {state === 'error' && error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {report ? (
        <View style={styles.reportCard}>
          <Text style={styles.reportTitle}>Access Report</Text>

          <InfoRow label="Platform" value={report.platform} />
          <InfoRow label="Accessible" value={report.accessible ? 'Yes' : 'No'} />
          <InfoRow label="Readable" value={report.readable ? 'Yes' : 'No'} />
          <InfoRow label="Writable" value={report.writable ? 'Yes' : 'No'} />
          <InfoRow label="Persistent" value={report.persistent ? 'Yes' : 'No'} />
          <InfoRow
            label="Security Scoped"
            value={report.securityScoped ? 'Yes' : 'No'}
          />
          <InfoRow
            label="Provider Backed"
            value={report.providerBacked ? 'Yes' : 'No'}
          />
          {report.seekable !== undefined ? (
            <InfoRow label="Seekable" value={report.seekable ? 'Yes' : 'No'} />
          ) : null}

          {report.requiredManifestPermissions.length > 0 ? (
            <View style={styles.permissionsList}>
              <Text style={styles.permissionsTitle}>
                Required Manifest Permissions:
              </Text>
              {report.requiredManifestPermissions.map((perm) => (
                <Text key={perm} style={styles.permissionItem}>
                  {perm}
                </Text>
              ))}
            </View>
          ) : null}

          <View style={styles.recoverySection}>
            <Text style={styles.recoveryTitle}>Recovery Action</Text>
            <Text style={styles.recoveryAction}>
              {recoveryActionLabel(report.recoveryAction)}
            </Text>
          </View>

          {report.reason ? (
            <View style={styles.reasonSection}>
              <Text style={styles.reasonTitle}>Reason</Text>
              <Text style={styles.reasonText}>{report.reason}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <TouchableOpacity
        style={[
          styles.checkButton,
          state === 'checking' && styles.disabledButton,
        ]}
        onPress={handleCheck}
        disabled={state === 'checking' || !path.trim()}
      >
        <Text style={styles.checkButtonText}>
          {state === 'checking' ? 'Checking...' : 'Check Access'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 15,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modesRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modeOption: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  modeOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  modeLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  modeLabelSelected: {
    color: colors.primary,
    fontWeight: '600',
  },
  centerBox: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  checkingText: {
    color: colors.textMuted,
    fontSize: 15,
    marginTop: 10,
  },
  errorBanner: {
    backgroundColor: colors.dangerSoft,
    borderRadius: 12,
    padding: 16,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
  },
  reportCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginVertical: 12,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  reportTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  infoLabel: {
    fontSize: 14,
    color: colors.textMuted,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  positive: {
    color: colors.success,
  },
  negative: {
    color: colors.danger,
  },
  permissionsList: {
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  permissionsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 4,
  },
  permissionItem: {
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: 'monospace',
    marginBottom: 2,
  },
  recoverySection: {
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  recoveryTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 4,
  },
  recoveryAction: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '500',
  },
  reasonSection: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  reasonTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.danger,
    marginBottom: 4,
  },
  reasonText: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  checkButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  checkButtonText: {
    color: colors.surface,
    fontSize: 17,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.5,
  },
})
