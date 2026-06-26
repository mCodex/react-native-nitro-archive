import React from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '../theme'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../navigation/AppNavigator'

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>

const buttons = [
  {
    title: 'Open Archive',
    subtitle: 'Inspect, list, extract, and validate ZIP archives',
    screen: 'OpenArchive' as const,
    icon: '📂',
  },
  {
    title: 'Create Archive',
    subtitle: 'Build ZIP archives from files, buffers, and directories',
    screen: 'CreateArchive' as const,
    icon: '📦',
  },
  {
    title: 'Validate Archive',
    subtitle: 'Check archive integrity and scan for issues',
    screen: 'ValidateArchive' as const,
    icon: '✅',
  },
  {
    title: 'Check Access',
    subtitle: 'Preflight file and URI access permissions',
    screen: 'AccessPreflight' as const,
    icon: '🔐',
  },
]

export function HomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets()

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top + 8 }]}
      contentContainerStyle={styles.content}
    >
      <View style={styles.header}>
        <Text style={styles.appIcon}>🗄️</Text>
        <Text style={styles.title}>Nitro Archive</Text>
        <Text style={styles.subtitle}>
          A production-grade ZIP archive library powered by Nitro Modules.
          Inspect, create, extract, and validate archives with native Swift and
          Kotlin performance.
        </Text>
      </View>

      <View style={styles.buttonContainer}>
        {buttons.map((btn) => (
          <TouchableOpacity
            key={btn.screen}
            style={styles.card}
            activeOpacity={0.7}
            onPress={() => navigation.navigate(btn.screen)}
          >
            <View style={styles.cardRow}>
              <Text style={styles.cardIcon}>{btn.icon}</Text>
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>{btn.title}</Text>
                <Text style={styles.cardSubtitle}>{btn.subtitle}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  appIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
  buttonContainer: {
    paddingHorizontal: 16,
    gap: 12,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardIcon: {
    fontSize: 28,
    marginRight: 14,
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 2,
  },
  cardSubtitle: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
  },
  chevron: {
    fontSize: 24,
    color: colors.placeholder,
    marginLeft: 8,
  },
})
