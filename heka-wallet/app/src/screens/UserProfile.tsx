import { HekaTheme, useHekaTheme, useGlobalStyles } from '@heka-wallet/shared'
import { InfoTextBox, ToastType } from '@hyperledger/aries-bifold-core'
import { useNetInfo } from '@react-native-community/netinfo'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View, Text, StyleSheet } from 'react-native'
import Toast from 'react-native-toast-message'

import { LoadingModal } from '../components/modals'
import { useRootStore } from '../contexts'
import { UserInfo } from '../types/auth'

const useStyles = (theme: HekaTheme) =>
  StyleSheet.create({
    profileAttributeContainer: {
      marginVertical: theme.Spacing.md,
    },
  })

export const UserProfile: React.FC = () => {
  const { t } = useTranslation()
  const theme = useHekaTheme()
  const globalStyles = useGlobalStyles()

  const netInfo = useNetInfo()

  const { oauthStore } = useRootStore()

  const [userInfo, setUserInfo] = useState<UserInfo | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Workaround to avoid additional trigger due to initial null value of 'netInfo.isConnected'
    if (netInfo.isConnected === null) return

    oauthStore
      .getUserInfo()
      .then((result) => setUserInfo(result))
      .catch((error) => {
        Toast.show({
          type: ToastType.Error,
          text1: t('Error.Problem'),
          text2: (error as Error)?.message || t('Error.Unknown'),
        })
      })
      .finally(() => setIsLoading(false))
  }, [t, oauthStore, netInfo.isConnected])

  const showNoConnectionInfo = !netInfo.isConnected

  if (isLoading) return <LoadingModal />
  return (
    <View style={globalStyles.defaultContainer}>
      {showNoConnectionInfo && (
        <InfoTextBox>
          <Text style={{ ...theme.TextTheme.normal, flexShrink: 1 }}>{t('UserProfile.NoConnectionInfoText')}</Text>
        </InfoTextBox>
      )}
      <ProfileAttribute title={t('UserProfile.UserId')} value={userInfo?.user_id} />
      <ProfileAttribute title={t('UserProfile.Name')} value={userInfo?.name} />
      <ProfileAttribute title={t('UserProfile.Email')} value={userInfo?.email} />
    </View>
  )
}

interface ProfileAttributeProps {
  title: string
  value: string | undefined
}

const ProfileAttribute: React.FC<ProfileAttributeProps> = ({ title, value }: ProfileAttributeProps) => {
  const { t } = useTranslation()
  const theme = useHekaTheme()
  const styles = useStyles(theme)

  return (
    <View style={styles.profileAttributeContainer}>
      <Text style={theme.TextTheme.title}>{title}</Text>
      <Text style={theme.TextTheme.normal}>{value ?? t('Common.NotSpecified')}</Text>
    </View>
  )
}
