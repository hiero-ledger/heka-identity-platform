import { formatTime } from '@bifold/core'
import { credentialTextColor, toImageSource } from '@bifold/core/src/utils/credential'
import { HekaTheme, useHekaTheme } from '@heka-wallet/shared'
import React, { useState } from 'react'
import { Image, StyleSheet, Text, View, ViewStyle } from 'react-native'

const useStyles = (
  { Spacing, IconSizes, ColorPalette, BorderWidth, BorderRadius }: HekaTheme,
  backgroundColor?: string
) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      gap: Spacing.md,
      minHeight: IconSizes.large,
      backgroundColor: backgroundColor ?? ColorPalette.grayscale.white,
    },
    containerWithBorder: {
      borderWidth: BorderWidth.small,
      borderRadius: BorderRadius.big,
      borderColor: ColorPalette.grayscale.lightGrey,
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
      color: credentialTextColor(ColorPalette, backgroundColor ?? ColorPalette.grayscale.white),
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
  // A logo URL published by the other party may be unreachable; `Image` fails silently, so drop
  // the failing URL instead of leaving an empty box next to the label.
  const [failedLogoUrl, setFailedLogoUrl] = useState<string>()
  const effectiveLogoUrl = logoUrl && logoUrl !== failedLogoUrl ? logoUrl : undefined
  return (
    <View style={{ ...styles.container, ...borderStyle, ...containerStyle }}>
      {effectiveLogoUrl && (
        <Image
          style={styles.connectionLogo}
          resizeMode={'contain'}
          source={toImageSource(effectiveLogoUrl)}
          onError={() => setFailedLogoUrl(effectiveLogoUrl)}
        />
      )}
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
