import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import type { ArchiveProgress } from 'react-native-nitro-archive'
import { ProgressBar } from './ProgressBar'
import { colors } from '../theme'

interface ExtractionProgressProps {
  progress: ArchiveProgress
  title?: string
}

function formatBytes(bytes: bigint | undefined): string {
  if (bytes === undefined) return 'N/A'
  if (bytes < 1024n) return `${bytes.toString()} B`
  if (bytes < 1048576n) return `${(Number(bytes) / 1024).toFixed(1)} KB`
  if (bytes < 1073741824n) return `${(Number(bytes) / 1048576).toFixed(1)} MB`
  return `${(Number(bytes) / 1073741824).toFixed(1)} GB`
}

export function ExtractionProgress({ progress, title = 'Progress' }: ExtractionProgressProps) {
  const percentage = progress.percentage ?? 0
  const isWaitingForFirstEntry =
    progress.phase === 'extracting' &&
    progress.processedBytes === 0n &&
    progress.processedEntries === 0

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.titleText}>{title}</Text>
        <Text style={styles.phaseText}>{progress.phase}</Text>
      </View>
      {progress.currentEntry ? (
        <Text style={styles.entryText} numberOfLines={1}>
          Entry: {progress.currentEntry}
        </Text>
      ) : null}
      <View style={styles.row}>
        <Text style={styles.label}>
          {formatBytes(progress.processedBytes)}
          {progress.totalBytes !== undefined
            ? ` / ${formatBytes(progress.totalBytes)}`
            : ''}
        </Text>
        <Text style={styles.label}>{percentage.toFixed(0)}%</Text>
      </View>
      <ProgressBar progress={percentage} />
      {isWaitingForFirstEntry ? (
        <Text style={styles.waitingText}>
          Preparing the first entry. Encrypted archives may not report byte
          totals until data is decrypted.
        </Text>
      ) : null}
      {progress.processedEntries > 0 ? (
        <Text style={styles.label}>
          Entries: {progress.processedEntries}
          {progress.totalEntries !== undefined
            ? ` / ${progress.totalEntries}`
            : ''}
        </Text>
      ) : null}
      {progress.bytesPerSecond !== undefined ? (
        <Text style={styles.label}>
          Speed: {formatBytes(BigInt(Math.round(progress.bytesPerSecond)))}/s
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  titleText: {
    color: colors.text,
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '700',
  },
  phaseText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  entryText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  label: {
    fontSize: 13,
    color: colors.textMuted,
  },
  waitingText: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 8,
  },
})
