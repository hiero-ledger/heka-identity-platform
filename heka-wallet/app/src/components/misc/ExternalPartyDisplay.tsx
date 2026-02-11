import { HekaTheme, useHekaTheme } from '@heka-wallet/shared'
import { credentialTextColor, toImageSource } from '@hyperledger/aries-bifold-core/App/utils/credential'
import { formatTime } from '@hyperledger/aries-bifold-core/App/utils/helpers'
import React from 'react'
import { Image, StyleSheet, Text, View, ViewStyle } from 'react-native'

const useStyles = (
  { Spacing, IconSizes, ColorPallet, BorderWidth, BorderRadius }: HekaTheme,
  backgroundColor?: string
) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      gap: Spacing.md,
      minHeight: IconSizes.large,
      backgroundColor: backgroundColor ?? ColorPallet.grayscale.white,
    },
    containerWithBorder: {
      borderWidth: BorderWidth.small,
      borderRadius: BorderRadius.big,
      borderColor: ColorPallet.grayscale.lightGrey,
      padding: Spacing.md,
    },
    connectionLogo: {
      height: '100%',
      width: IconSizes.large,
      borderRadius: Spacing.xs,
    },
    textContainer: {
      flex: 1,
      gap: Spacing.xxxxs,
      color: credentialTextColor(ColorPallet, backgroundColor ?? ColorPallet.grayscale.white),
    },
  })

interface Props {
  label: string
  backgroundColor?: string
  logoUrl?: string
  interactionDate?: Date
  containerStyle?: ViewStyle
  withBorder?: boolean
}

export const ExternalPartyDisplay: React.FC<Props> = ({
  containerStyle,
  withBorder = true,
  backgroundColor,
  logoUrl,
  label,
  interactionDate,
}) => {
  const theme = useHekaTheme()
  const styles = useStyles(theme, backgroundColor)
  const { TextTheme } = theme
  const borderStyle = withBorder ? styles.containerWithBorder : {}
  return (
    <View style={{ ...styles.container, ...borderStyle, ...containerStyle }}>
      {logoUrl && <Image style={styles.connectionLogo} resizeMode={'contain'} source={toImageSource(logoUrl)} />}
      <View style={styles.textContainer}>
        <Text style={{ ...TextTheme.normal, color: styles.textContainer.color }} numberOfLines={1}>
          {label}
        </Text>
        {interactionDate && (
          <Text style={{ ...TextTheme.caption, color: styles.textContainer.color }}>
            {formatTime(interactionDate, { shortMonth: true })}
          </Text>
        )}
      </View>
    </View>
  )
}
