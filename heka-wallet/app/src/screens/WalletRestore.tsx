import { HekaTheme, useHekaTheme } from '@heka-wallet/shared'
import {
  Button,
  ButtonType,
  OnboardingStackParams,
  Screens as BifoldScreens,
  ToastType,
  useStore as useBifoldStore,
} from '@hyperledger/aries-bifold-core'
import { DispatchAction } from '@hyperledger/aries-bifold-core/App/contexts/reducers/store'
import { useNavigation } from '@react-navigation/core'
import { StackNavigationProp } from '@react-navigation/stack'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native'
import Toast from 'react-native-toast-message'

import { HieroLogo } from '../components/misc'
import { LoadingModal, PasskeysAuthModal, usePasskeysAuthModal } from '../components/modals'
import { Loader } from '../components/views/LoadingView'
import { useRootStore } from '../contexts'
import { RootStackParams, Stacks } from '../navigators/types'
import { useWalletBackupHelpers } from '../utils/useWalletBackupHelpers'

const useStyles = ({ TextTheme, Spacing }: HekaTheme) => {
  return StyleSheet.create({
    container: {
      flex: 1,
      paddingHorizontal: Spacing.lg,
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

export const WalletRestore: React.FC = () => {
  const { t } = useTranslation()

  const theme = useHekaTheme()
  const styles = useStyles(theme)

  const navigation = useNavigation<StackNavigationProp<RootStackParams & OnboardingStackParams>>()

  const [, dispatch] = useBifoldStore()
  const { passkeysStore } = useRootStore()

  const { tryDownloadRemoteBackup, restoreWallet } = useWalletBackupHelpers()

  const {
    isVisible: isPasskeysAuthModalVisible,
    show: showPasskeysAuthModal,
    hide: hidePasskeysAuthModal,
  } = usePasskeysAuthModal()

  const [isLoading, setIsLoading] = useState(true)
  const [inProgress, setInProgress] = useState(false)
  const [user, setUser] = useState<string | undefined>(undefined)

  const [isBackupAvailable, setIsBackupAvailable] = useState(false)

  useEffect(() => {
    if (user) {
      return
    }
    passkeysStore.getUser().then((usr) => setUser(usr))
  }, [user, passkeysStore])

  useEffect(() => {
    if (!user) {
      return
    }

    if (!passkeysStore.isAuthenticated) {
      showPasskeysAuthModal()
      return
    }

    tryDownloadRemoteBackup(user)
      .then((isBackupAvailable) => {
        setIsBackupAvailable(isBackupAvailable)
      })
      .finally(() => setIsLoading(false))
  }, [user, passkeysStore.isAuthenticated, showPasskeysAuthModal, tryDownloadRemoteBackup])

  const setBifoldTutorialCompleted = () => {
    dispatch({
      type: DispatchAction.DID_COMPLETE_TUTORIAL,
    })
    dispatch({
      type: DispatchAction.DID_CREATE_PIN,
    })
  }

  const onCancel = () => {
    navigation.navigate(BifoldScreens.Onboarding)
  }

  const onRestore = async () => {
    setInProgress(true)
    try {
      await restoreWallet()

      setBifoldTutorialCompleted()

      navigation.navigate(Stacks.BifoldStack, { screen: BifoldScreens.Terms })
    } catch (error: unknown) {
      console.error(error)
      Toast.show({
        type: ToastType.Error,
        text1: t('Global.Failure'),
        text2: (error as Error)?.message || t('Error.Unknown'),
        visibilityTime: 2000,
      })
    } finally {
      setInProgress(false)
    }
  }

  const backupStatusText = isBackupAvailable
    ? t('WalletBackup.BackupIsAvailable')
    : t('WalletBackup.BackupIsNotAvailable')
  const backupStatusColor = !isBackupAvailable ? theme.ColorPallet.semantic.error : theme.TextTheme.normal.color

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor={theme.ColorPallet.brand.primaryBackground} />
      {isLoading ? (
        // Workaround for modal rendering issues on iOS (not possible to render more than one)
        // See https://github.com/react-native-modal/react-native-modal/issues/30
        !isPasskeysAuthModalVisible && <LoadingModal />
      ) : (
        <>
          <View style={styles.logoContainer}>
            <HieroLogo />
          </View>
          <Text style={[styles.details, { color: backupStatusColor }]}>{backupStatusText}</Text>
          <View style={styles.loaderContainer}>{inProgress && <Loader size={styles.loaderContainer.minHeight} />}</View>
          <View style={styles.controlsContainer}>
            <Button
              title={t('Global.Cancel')}
              buttonType={ButtonType.Secondary}
              onPress={onCancel}
              disabled={inProgress}
            />
            <Button
              title={t('WalletBackup.RestoreWallet')}
              buttonType={ButtonType.Primary}
              onPress={onRestore}
              disabled={inProgress || !isBackupAvailable}
            />
          </View>
        </>
      )}
      <PasskeysAuthModal
        isVisible={isPasskeysAuthModalVisible}
        title={t('WalletBackup.UsePasskeyToAuth')}
        onComplete={hidePasskeysAuthModal}
        onCancel={onCancel}
        useExistingKeyOption
      />
    </SafeAreaView>
  )
}
