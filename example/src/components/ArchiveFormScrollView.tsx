import React from 'react'
import { Platform, ScrollView, type ScrollViewProps } from 'react-native'

export function ArchiveFormScrollView(props: ScrollViewProps) {
  return (
    <ScrollView
      automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
      keyboardShouldPersistTaps="handled"
      {...props}
    />
  )
}
