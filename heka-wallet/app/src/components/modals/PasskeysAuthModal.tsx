import { Button, ButtonLocation, ButtonType, IconButton } from '@bifold/core'
import { HekaTheme, platformBackIconConfig, useHekaTheme } from '@heka-wallet/shared'
import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native'

import { usePasskeyAuth } from '../../hooks/usePasskeyAuth'
import { HieroLogo } from '../misc'
import { Loader } from '../views/LoadingView'

const useStyles = ({ ColorPalette, TextTheme, Spacing }: HekaTheme) => {
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
    error: {
      ...TextTheme.normal,
      color: ColorPalette.semantic.error,
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

  const { register, authenticate, isLoading, error } = usePasskeyAuth(onComplete)

  return (
    <Modal visible={isVisible} animationType="fade" onRequestClose={onCancel}>
      <StatusBar backgroundColor={theme.ColorPalette.brand.primaryBackground} />
      <SafeAreaView style={{ paddingTop: theme.Spacing.md }}>
        <IconButton
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
        {!!error && <Text style={styles.error}>{t('Error.Problem')}</Text>}
        <View style={styles.loaderContainer}>{isLoading && <Loader size={styles.loaderContainer.minHeight} />}</View>
        <SafeAreaView style={styles.controlsContainer}>
          {useExistingKeyOption && (
            <Button
              title={t('Passkeys.AuthenticateWithExisting')}
              buttonType={ButtonType.Primary}
              onPress={authenticate}
              disabled={isLoading}
            />
          )}
          {createNewKeyOption && (
            <Button
              title={t('Passkeys.CreateNew')}
              buttonType={ButtonType.Primary}
              onPress={register}
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
