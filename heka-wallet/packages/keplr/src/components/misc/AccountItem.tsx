import { HekaTheme, useHekaTheme, BootstrapIcon } from '@heka-wallet/shared'
import React from 'react'
import { StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native'

const useStyles = (theme: HekaTheme) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: theme.Spacing.md,
      backgroundColor: theme.ColorPallet.brand.primaryBackground,
    },
    labelContainer: {
      flex: 3,
      justifyContent: 'center',
    },
    left: {
      marginRight: theme.Spacing.md,
      paddingVertical: theme.Spacing.xs,
    },
    right: {
      flex: 1,
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
    },
    paragraph: {
      ...theme.TextTheme.labelSubtitle,
      marginTop: theme.Spacing.xxxs,
    },
  })

interface Props {
  containerStyle?: ViewStyle
  label: string
  paragraph?: string
  left?: React.ReactElement
  right?: React.ReactElement
  onPress?: () => void
  disabled?: boolean
}

export const AccountItem: React.FC<Props> = ({ containerStyle, label, paragraph, left, right, onPress, disabled }) => {
  const theme = useHekaTheme()
  const styles = useStyles(theme)

  return (
    <TouchableOpacity style={{ ...styles.container, ...containerStyle }} onPress={onPress} disabled={disabled}>
      <View style={styles.left}>
        {left ?? <BootstrapIcon name={'wallet'} color={theme.ColorPallet.brand.primary} size={theme.IconSizes.large} />}
      </View>
      <View style={styles.labelContainer}>
        <Text numberOfLines={1} style={theme.TextTheme.labelTitle}>
          {label}
        </Text>
        {paragraph && <Text style={styles.paragraph}>{paragraph}</Text>}
      </View>
      <View style={styles.right}>{right}</View>
    </TouchableOpacity>
  )
}
