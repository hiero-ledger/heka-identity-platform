import { formatTime } from '@bifold/core'
import { hitSlop } from '@bifold/core/src/constants'
import { HekaTheme, useHekaTheme } from '@heka-wallet/shared'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import MaterialIcon from 'react-native-vector-icons/MaterialIcons'

const useStyles = ({ BorderRadius, ColorPalette, Spacing, TextTheme }: HekaTheme) =>
  StyleSheet.create({
    container: {
      backgroundColor: ColorPalette.semantic.errorTransparentLight,
      borderRadius: BorderRadius.big,
      padding: Spacing.md,
      marginTop: Spacing.md,
      gap: Spacing.xs,
    },
    headerContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
    },
    title: {
      ...TextTheme.bold,
      color: ColorPalette.semantic.error,
      flexShrink: 1,
    },
    text: {
      ...TextTheme.normal,
    },
    dismissText: {
      ...TextTheme.labelTitle,
      color: ColorPalette.semantic.error,
      alignSelf: 'flex-end',
    },
  })

interface Props {
  revocationDate?: Date | string
  comment?: string
  showMessage?: boolean
  onDismiss?: () => void
}

// Heka-styled version of the revocation info shown by Bifold's CredentialDetails screen (same strings and behaviour)
export const CredentialRevokedBanner: React.FC<Props> = ({
  revocationDate,
  comment,
  showMessage = true,
  onDismiss,
}) => {
  const { t } = useTranslation()

  const theme = useHekaTheme()
  const styles = useStyles(theme)
  const { ColorPalette, IconSizes } = theme

  // The date is restored from storage as a string, so it is parsed the same way Bifold does
  const date = revocationDate ? new Date(revocationDate) : undefined
  const formattedDate = date && !isNaN(date.getTime()) ? formatTime(date, { includeHour: true }) : undefined

  return (
    <View style={styles.container} accessibilityRole="alert" testID="CredentialRevokedBanner">
      <View style={styles.headerContainer}>
        <MaterialIcon name={'error-outline'} size={IconSizes.medium} color={ColorPalette.semantic.error} />
        <Text style={styles.title}>{t('CredentialDetails.CredentialRevokedMessageTitle')}</Text>
      </View>
      {formattedDate && (
        <Text style={styles.text} testID="RevokedDate">
          {`${t('CredentialDetails.Revoked')}: ${formattedDate}`}
        </Text>
      )}
      {showMessage && (
        <>
          <Text style={styles.text} testID="RevocationMessage">
            {comment || t('CredentialDetails.CredentialRevokedMessageBody')}
          </Text>
          {onDismiss && (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t('Global.Dismiss')}
              onPress={onDismiss}
              hitSlop={hitSlop}
            >
              <Text style={styles.dismissText}>{t('Global.Dismiss')}</Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
  )
}
