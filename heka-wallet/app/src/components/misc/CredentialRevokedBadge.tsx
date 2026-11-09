import { HekaTheme, useHekaTheme } from '@heka-wallet/shared'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'

const useStyles = ({ BorderRadius, ColorPalette, HekaTextTheme, Spacing }: HekaTheme) =>
  StyleSheet.create({
    container: {
      alignSelf: 'flex-start',
      backgroundColor: ColorPalette.semantic.error,
      borderRadius: BorderRadius.small,
      paddingHorizontal: Spacing.xs,
      paddingVertical: Spacing.xxxxs,
    },
    text: {
      ...HekaTextTheme.labelMedium,
      color: ColorPalette.grayscale.white,
    },
  })

// Marks a revoked credential on credential cards and list rows; same colour as the revocation banner on the details screen
export const CredentialRevokedBadge: React.FC = () => {
  const { t } = useTranslation()

  const theme = useHekaTheme()
  const styles = useStyles(theme)

  return (
    <View style={styles.container} testID="CredentialRevokedBadge">
      <Text style={styles.text} numberOfLines={1}>
        {t('CredentialDetails.Revoked')}
      </Text>
    </View>
  )
}
