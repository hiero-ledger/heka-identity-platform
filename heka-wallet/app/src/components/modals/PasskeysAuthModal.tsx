import { HekaTheme, platformBackIconConfig, useHekaTheme } from '@heka-wallet/shared'
import { Button, ButtonLocation, ButtonType, HeaderButton } from '@hyperledger/aries-bifold-core'
import { useIsFocused } from '@react-navigation/native'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native'

import { useRootStore } from '../../contexts'
import { HieroLogo } from '../misc'
import { Loader } from '../views/LoadingView'

const useStyles = ({ TextTheme, Spacing }: HekaTheme) => {
  return StyleSheet.create({
    container: {
      flex: 1,
      paddingHorizontal: Spacing.md,
      gap: Spacing.md,
    },
    logoContainer: {
      paddingVertical: Spacing.xxl,
    },
    details: {
      ...TextTheme.normal,
      textAlign: 'center',
    },
    loaderContainer: {
      flex: 1,
      minHeight: Spacing.xxxl,
      flexDirection: 'column',
      justifyContent: 'flex-end',
    },
    controlsContainer: {
      marginTop: 'auto',
      margin: Spacing.lg,
      gap: Spacing.sm,
    },
  })
}

interface Props {
  isVisible: boolean
  title: string
  onComplete: () => void
  onCancel: () => void
  useExistingKeyOption?: boolean
  createNewKeyOption?: boolean
}

export const PasskeysAuthModal: React.FC<Props> = ({
  isVisible,
  title,
  onComplete,
  onCancel,
  useExistingKeyOption = true,
  createNewKeyOption = false,
}) => {
  const { t } = useTranslation()

  const theme = useHekaTheme()
  const styles = useStyles(theme)

  const { passkeysStore } = useRootStore()

  const [isLoading, setIsLoading] = useState(false)
  const isScreenFocused = useIsFocused()

  // Workaround for loading state on iOS if device was locked during auth process
  useEffect(() => {
    if (isScreenFocused) {
      setIsLoading(false)
    }
  }, [isScreenFocused])

  const onRegister = useCallback(async () => {
    setIsLoading(true)
    try {
      const user = await passkeysStore.getUser()
      await passkeysStore.register(user)
      onComplete()
    } finally {
      setIsLoading(false)
    }
  }, [passkeysStore, onComplete])

  const onAuthenticate = useCallback(async () => {
    setIsLoading(true)
    try {
      const user = await passkeysStore.getUser()
      await passkeysStore.authenticate(user)
      onComplete()
    } finally {
      setIsLoading(false)
    }
  }, [passkeysStore, onComplete])

  return (
    <Modal visible={isVisible} animationType="fade" onRequestClose={onCancel}>
      <StatusBar backgroundColor={theme.ColorPallet.brand.primaryBackground} />
      <SafeAreaView style={{ paddingTop: theme.Spacing.md }}>
        <HeaderButton
          onPress={onCancel}
          icon={platformBackIconConfig.name}
          buttonLocation={ButtonLocation.Left}
          testID={t('Global.Cancel')}
          accessibilityLabel={t('Global.Cancel')}
        />
      </SafeAreaView>
      <View style={styles.container}>
        <View style={styles.logoContainer}>
          <HieroLogo />
        </View>
        <Text style={styles.details}>{title}</Text>
        <View style={styles.loaderContainer}>{isLoading && <Loader size={styles.loaderContainer.minHeight} />}</View>
        <SafeAreaView style={styles.controlsContainer}>
          {useExistingKeyOption && (
            <Button
              title={t('Passkeys.AuthenticateWithExisting')}
              buttonType={ButtonType.Primary}
              onPress={onAuthenticate}
              disabled={isLoading}
            />
          )}
          {createNewKeyOption && (
            <Button
              title={t('Passkeys.CreateNew')}
              buttonType={ButtonType.Primary}
              onPress={onRegister}
              disabled={isLoading}
            />
          )}
        </SafeAreaView>
      </View>
    </Modal>
  )
}

export const usePasskeysAuthModal = () => {
  const [isVisible, setIsVisible] = useState(false)

  const show = useCallback(() => {
    setIsVisible(true)
  }, [])

  const hide = useCallback(() => {
    setIsVisible(false)
  }, [])

  return { isVisible, show, hide }
}
