import React, { useEffect, useRef } from 'react'
import { Animated, View, StyleSheet } from 'react-native'
import { colors } from '../theme'

interface ProgressBarProps {
  progress: number
  color?: string
  height?: number
  backgroundColor?: string
}

export function ProgressBar({
  progress,
  color = colors.primary,
  height = 6,
  backgroundColor = colors.border,
}: ProgressBarProps) {
  const animatedWidth = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(animatedWidth, {
      toValue: Math.min(Math.max(progress, 0), 100),
      duration: 200,
      useNativeDriver: false,
    }).start()
  }, [progress, animatedWidth])

  const widthInterpolated = animatedWidth.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  })

  return (
    <View style={[styles.track, { height, backgroundColor }]}>
      <Animated.View
        style={[
          styles.fill,
          { width: widthInterpolated, height, backgroundColor: color },
        ]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  track: {
    borderRadius: 3,
    overflow: 'hidden',
    width: '100%',
  },
  fill: {
    borderRadius: 3,
  },
})
