import { Button, ButtonType } from '@bifold/core'
import ButtonLoading from '@bifold/core/src/components/animated/ButtonLoading'
import { GlobalLogger, useGlobalStyles } from '@heka-wallet/shared'
import { useIsFocused } from '@react-navigation/native'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { HieroLogo } from '../components/misc'
import { useRootStore } from '../contexts'

const logger = GlobalLogger.createContextLogger('Login')

export const Login: React.FC = () => {
  const globalStyles = useGlobalStyles()
  const { t } = useTranslation()

  const { oauthStore } = useRootStore()

  const [isLoading, setIsLoading] = useState(false)
  const isScreenFocused = useIsFocused()

  // Workaround for loading state on iOS if device was locked during auth process
  useEffect(() => {
    if (isScreenFocused) {
      setIsLoading(false)
    }
  }, [isScreenFocused])

  const onLogin = useCallback(async () => {
    setIsLoading(true)
    try {
      await oauthStore.logIn()
    } catch (error) {
      // OAuthStore already logs the underlying cause; this keeps the rejection from going unhandled
      // and records that the login attempt itself failed.
      logger.error('Login failed:', error)
    } finally {
      setIsLoading(false)
    }
  }, [oauthStore])

  return (
    <View
      style={{
        ...globalStyles.defaultContainer,
        ...globalStyles.adaptivePadding,
      }}
    >
      <HieroLogo />
      <Button title={t('Auth.Login')} buttonType={ButtonType.Primary} onPress={onLogin} disabled={isLoading}>
        {isLoading && <ButtonLoading />}
      </Button>
    </View>
  )
}
