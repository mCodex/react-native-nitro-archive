import { useState } from 'react'
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native'
import { colors } from '../theme'

type Props = TextInputProps & { label: string }

export function ArchiveTextField({ label, style, onFocus, onBlur, ...props }: Props) {
  const [focused, setFocused] = useState(false)

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize={props.multiline ? 'sentences' : 'none'}
        autoCorrect={props.multiline === true}
        placeholderTextColor={colors.textSubtle}
        underlineColorAndroid="transparent"
        {...props}
        onFocus={event => {
          setFocused(true)
          onFocus?.(event)
        }}
        onBlur={event => {
          setFocused(false)
          onBlur?.(event)
        }}
        style={[
          styles.input,
          props.multiline && styles.multiline,
          focused && styles.focused,
          props.editable === false && styles.disabled,
          style,
        ]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  field: { alignSelf: 'stretch', marginBottom: 12, gap: 6 },
  label: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  input: {
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 16,
  },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  focused: { borderColor: colors.primary },
  disabled: { backgroundColor: colors.surfaceMuted, color: colors.textMuted },
})
