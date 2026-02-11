import React from 'react'
import { Insets, StyleSheet, Text, TextStyle, TouchableOpacity, ViewStyle } from 'react-native'

import { HekaTheme, useHekaTheme } from '../../theme'
import { BootstrapIcon, IconName } from '../icons'

const DEFAULT_ICON_SIZE = 24

const useStyles = (theme: HekaTheme) =>
  StyleSheet.create({
    container: {
      paddingHorizontal: theme.Spacing.md,
      flexDirection: 'row',
    },
  })

interface Props {
  onPress: () => void
  iconName: IconName
  label?: string
  iconColor?: string
  iconSize?: number
  containerStyle?: ViewStyle
  textStyle?: TextStyle
  accessibilityLabel?: string
  testId?: string
  hitSlop?: Insets
}

export const IconButton: React.FC<Props> = ({
  onPress,
  iconName,
  label,
  iconColor,
  iconSize,
  containerStyle,
  textStyle,
  accessibilityLabel,
  testId,
  hitSlop,
}) => {
  const theme = useHekaTheme()
  const styles = useStyles(theme)

  return (
    <TouchableOpacity
      accessible={true}
      accessibilityLabel={accessibilityLabel}
      testID={testId}
      style={{ ...styles.container, ...containerStyle }}
      onPress={onPress}
      hitSlop={hitSlop}
    >
      <BootstrapIcon
        name={iconName}
        size={iconSize ?? DEFAULT_ICON_SIZE}
        color={iconColor ?? theme.ColorPallet.brand.icon}
      />
      {!!label && (
        <Text style={{ ...theme.Buttons.primaryText, marginLeft: theme.Spacing.xs, ...textStyle }}>{label}</Text>
      )}
    </TouchableOpacity>
  )
}
