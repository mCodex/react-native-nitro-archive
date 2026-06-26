import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import type { ArchiveFormat } from 'react-native-nitro-archive'
import { colors } from '../theme'

interface ArchiveInfoProps {
  format: ArchiveFormat
  entryCount: number
  compressedSize?: bigint
  totalUncompressedSize?: bigint
  encrypted: boolean
  comment?: string
}

function formatBytes(bytes: bigint | undefined): string {
  if (bytes === undefined) return 'N/A'
  if (bytes < 1024n) return `${bytes.toString()} B`
  if (bytes < 1048576n) return `${(Number(bytes) / 1024).toFixed(1)} KB`
  if (bytes < 1073741824n) return `${(Number(bytes) / 1048576).toFixed(1)} MB`
  return `${(Number(bytes) / 1073741824).toFixed(1)} GB`
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  )
}

export function ArchiveInfo({
  format,
  entryCount,
  compressedSize,
  totalUncompressedSize,
  encrypted,
  comment,
}: ArchiveInfoProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Archive Info</Text>
      <InfoRow label="Format" value={format.toUpperCase()} />
      <InfoRow label="Entries" value={entryCount.toLocaleString()} />
      <InfoRow label="Compressed" value={formatBytes(compressedSize)} />
      <InfoRow
        label="Uncompressed"
        value={formatBytes(totalUncompressedSize)}
      />
      <InfoRow label="Encrypted" value={encrypted ? 'Yes' : 'No'} />
      {comment ? <InfoRow label="Comment" value={comment} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  label: {
    fontSize: 15,
    color: colors.textMuted,
  },
  value: {
    fontSize: 15,
    color: colors.text,
    fontWeight: '500',
  },
})
