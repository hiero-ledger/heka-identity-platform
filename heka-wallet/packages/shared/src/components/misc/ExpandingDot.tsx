import React, { useMemo } from 'react'
import { Animated, StyleSheet, useWindowDimensions, View, ViewStyle } from 'react-native'

import { ColorPallet } from '../../theme'

const styles = StyleSheet.create({
  containerStyle: {
    position: 'absolute',
    bottom: 20,
    flexDirection: 'row',
    alignSelf: 'center',
  },
  dotStyle: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginHorizontal: 5,
  },
})

interface Props {
  dotsCount: number
  scrollX: Animated.Value
  dotStyle: ViewStyle
  containerStyle?: ViewStyle
  inactiveDotOpacity?: number
  expandingDotWidth?: number
  previousDotColor?: string
  activeDotColor?: string
  nextDotColor?: string
}

// Based on https://github.com/weahforsage/react-native-animated-pagination-dots/blob/main/src/dots/ExpandingDot.tsx
export const ExpandingDot: React.FC<Props> = ({
  dotsCount,
  scrollX,
  dotStyle,
  containerStyle,
  inactiveDotOpacity = 1,
  expandingDotWidth = 20,
  previousDotColor = ColorPallet.grayscale.darkGrey,
  activeDotColor = ColorPallet.grayscale.white,
  nextDotColor = ColorPallet.grayscale.darkGrey,
}) => {
  const { width } = useWindowDimensions()

  const dotWidth = (dotStyle.width as number) ?? 10

  const data = useMemo(() => Array.from(Array(dotsCount).keys()), [dotsCount])

  return (
    <View style={{ ...styles.containerStyle, ...containerStyle }}>
      {data.map((_, index) => {
        // Input range for animated value interpolation
        const inputRange = [(index - 1) * width, index * width, (index + 1) * width]

        const color = scrollX.interpolate({
          inputRange,
          outputRange: [nextDotColor, activeDotColor, previousDotColor],
          extrapolate: 'clamp',
        })

        const opacity = scrollX.interpolate({
          inputRange,
          outputRange: [inactiveDotOpacity, 1, inactiveDotOpacity],
          extrapolate: 'clamp',
        })

        const expand = scrollX.interpolate({
          inputRange,
          outputRange: [dotWidth, expandingDotWidth, dotWidth],
          extrapolate: 'clamp',
        })

        return (
          <Animated.View
            key={`dot-${index}`}
            style={{ ...styles.dotStyle, ...dotStyle, width: expand, opacity, backgroundColor: color }}
          />
        )
      })}
    </View>
  )
}
