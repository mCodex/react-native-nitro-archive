import React, { useEffect, useRef } from 'react'
import { Keyboard, Platform, ScrollView, TextInput, type ScrollViewProps } from 'react-native'

export function ArchiveFormScrollView({ onLayout, ...props }: ScrollViewProps) {
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null)

  function revealFocusedInput() {
    const view = scroll.current
    const viewport = view?.getNativeScrollRef()
    const content = view?.getInnerViewRef()
    const input = TextInput.State.currentlyFocusedInput()
    if (!view || !viewport || !content || !input) return

    viewport.measureInWindow((_left, top, _width, height) => {
      input.measureInWindow((_inputLeft, inputTop, _inputWidth, inputHeight) => {
        if (inputTop + inputHeight <= top + height) return

        input.measureLayout(content, (_x, y, _width, fieldHeight) => {
          view.scrollTo({ y: Math.max(0, y + fieldHeight - height + 12), animated: true })
        })
      })
    })
  }

  useEffect(() => {
    if (Platform.OS !== 'android') return
    const subscription = Keyboard.addListener('keyboardDidShow', revealFocusedInput)
    return () => subscription.remove()
  }, [])

  return (
    <ScrollView
      ref={scroll}
      automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
      keyboardShouldPersistTaps="handled"
      {...props}
      onLayout={(event) => {
        onLayout?.(event)
        if (Platform.OS === 'android' && Keyboard.isVisible()) revealFocusedInput()
      }}
    />
  )
}
