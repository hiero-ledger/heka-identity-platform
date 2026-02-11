import React from 'react'
import { Text, View, ViewStyle } from 'react-native'

import { useHekaTheme } from '../../theme'

interface Props {
  title: string
  textLines: string[]
  containerStyle?: ViewStyle
}

export const ScreenInfoText: React.FC<Props> = ({ title, textLines, containerStyle }) => {
  const theme = useHekaTheme()

  return (
    <View style={{ marginBottom: theme.Spacing.xxl, ...containerStyle }}>
      <Text style={{ ...theme.TextTheme.headingThree, marginBottom: theme.Spacing.xl }}>{title}</Text>
      {textLines.map((text, index) => {
        const marginTop = index !== 0 ? theme.Spacing.md : 0
        return (
          <Text key={index} style={{ ...theme.TextTheme.caption, marginTop }}>
            {text}
          </Text>
        )
      })}
    </View>
  )
}
