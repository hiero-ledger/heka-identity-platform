import { HekaTheme, useHekaTheme } from '@heka-wallet/shared'
import React from 'react'
import { TouchableOpacity, StyleSheet, Text, ViewStyle } from 'react-native'

const useStyles = (theme: HekaTheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      minWidth: 90,
      minHeight: 30,
      padding: theme.Spacing.xxxs,
      borderRadius: theme.BorderRadius.extraSmall / 2,
      borderWidth: theme.BorderWidth.small,
    },
  })

interface Props {
  word: string
  index?: number
  hideWord?: boolean
  highlightBorder?: boolean
  highlightContent?: boolean
  onPress?: () => void
  containerStyle?: ViewStyle
}

export const WordChip: React.FC<Props> = ({
  index,
  word,
  hideWord,
  highlightBorder,
  highlightContent,
  onPress,
  containerStyle,
}) => {
  const theme = useHekaTheme()
  const styles = useStyles(theme)

  const isEmpty = !word
  return (
    <TouchableOpacity
      style={{
        ...styles.container,
        paddingLeft: isEmpty ? theme.Spacing.md : undefined,
        alignItems: isEmpty ? 'flex-start' : 'center',
        borderColor:
          highlightBorder || highlightContent
            ? theme.ColorPallet.grayscale.lightGrey
            : theme.ColorPallet.grayscale.mediumGrey,
        backgroundColor: highlightContent ? theme.ColorPallet.grayscale.white : theme.ColorPallet.grayscale.darkGrey,
        ...containerStyle,
      }}
      disabled={!onPress}
      onPress={onPress}
    >
      <Text
        style={{
          color: highlightContent ? theme.ColorPallet.grayscale.black : theme.ColorPallet.grayscale.white,
          opacity: hideWord ? 1 : undefined,
        }}
      >
        {index ? `${index}. ${word}` : word}
      </Text>
    </TouchableOpacity>
  )
}
