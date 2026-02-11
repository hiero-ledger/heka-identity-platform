import React, { useEffect, useRef, useState } from 'react'
import { Animated, StyleSheet, useWindowDimensions } from 'react-native'

import { HekaTheme, useHekaTheme } from '../../theme'

import { ExpandingDot } from './ExpandingDot'

const HEADER_WIDTH = 120

const useStyles = (theme: HekaTheme) =>
  StyleSheet.create({
    dot: {
      height: 5,
      color: theme.ColorPallet.grayscale.white,
      borderRadius: theme.BorderRadius.extraSmall,
      borderColor: theme.ColorPallet.grayscale.white,
    },
  })

interface StepProgressHeaderState {
  stepsCount: number
  currentStepIndex: number
}

export const StepProgressHeader: React.FC<StepProgressHeaderState> = ({ stepsCount, currentStepIndex }) => {
  const theme = useHekaTheme()
  const styles = useStyles(theme)

  const { width } = useWindowDimensions()

  const scrollX = useRef(new Animated.Value(0)).current

  useEffect(() => {
    scrollX.setValue(width * currentStepIndex)
  }, [scrollX, width, currentStepIndex])

  const dotWidth = HEADER_WIDTH / stepsCount
  const expandedDotWidth = dotWidth * 1.5
  return (
    <ExpandingDot
      dotsCount={stepsCount}
      scrollX={scrollX}
      previousDotColor={theme.ColorPallet.grayscale.white}
      activeDotColor={theme.ColorPallet.grayscale.white}
      nextDotColor={theme.ColorPallet.grayscale.darkGrey}
      dotStyle={{ ...styles.dot, width: dotWidth }}
      expandingDotWidth={expandedDotWidth}
    />
  )
}

export const useStepsProgressHeader = (initialState?: StepProgressHeaderState) => {
  const [progressState, setProgressState] = useState<StepProgressHeaderState>(
    initialState ?? { stepsCount: 1, currentStepIndex: 0 }
  )

  return { progressState, setProgressState }
}
