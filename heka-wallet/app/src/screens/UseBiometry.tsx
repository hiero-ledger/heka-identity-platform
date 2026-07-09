import { Button, ButtonType, DispatchAction, useAuth, useStore } from '@bifold/core'
import { HekaTheme, useHekaTheme } from '@heka-wallet/shared'
import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View, Modal, Switch, ScrollView, Pressable, Linking, Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import FingerprintImage from '../assets/fingerprint.svg'
import { AlertModal } from '../components/modals'
import { Loader } from '../components/views/LoadingView'

import PINEnter, { PINEntryUsage } from './PINEnter'

const ANDROID_SETTINGS_INTENT = 'android.settings.SETTINGS'
const IOS_SETTINGS_URL = 'App-prefs:root'

enum UseBiometryUsage {
  InitialSetup,
  ToggleOnOff,
}

const useStyles = ({ TextTheme, Spacing }: HekaTheme) => {
  return StyleSheet.create({
    container: {
      height: '100%',
      padding: Spacing.lg,
      gap: Spacing.xxl,
    },
    textContainer: {
      gap: Spacing.xxl,
    },
    textDetails: TextTheme.normal,
    switchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    imageContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    controlsContainer: {
      marginTop: 'auto',
      margin: Spacing.lg,
    },
    loaderContainer: {
      minHeight: Spacing.xxxl,
      margin: Spacing.lg,
    },
  })
}

const UseBiometry: React.FC = () => {
  const theme = useHekaTheme()
  const styles = useStyles(theme)

  const [store, dispatch] = useStore()

  const { t } = useTranslation()
  const { isBiometricsActive, commitWalletToKeychain, disableBiometrics } = useAuth()
  const [biometryAvailable, setBiometryAvailable] = useState(false)
  const [biometryEnabled, setBiometryEnabled] = useState(store.preferences.useBiometry)
  const [canSeeCheckPIN, setCanSeeCheckPIN] = useState<boolean>(false)
  const { ColorPalette, TextTheme } = useHekaTheme()
  const screenUsage = store.onboarding.didConsiderBiometry
    ? UseBiometryUsage.ToggleOnOff
    : UseBiometryUsage.InitialSetup

  const [isLoading, setIsLoading] = useState(false)
  const [showSettingsPopup, setShowSettingsPopup] = useState(false)

  useEffect(() => {
    isBiometricsActive().then((result) => {
      setBiometryAvailable(result)
    })
  }, [isBiometricsActive])

  const continueTouched = async () => {
    try {
      setIsLoading(true)
      await commitWalletToKeychain(biometryEnabled)

      dispatch({
        type: DispatchAction.USE_BIOMETRY,
        payload: [biometryEnabled],
      })
    } finally {
      setIsLoading(false)
    }
  }

  const onOpenSettingsTouched = async () => {
    if (Platform.OS === 'android') {
      await Linking.sendIntent(ANDROID_SETTINGS_INTENT)
    } else if (Platform.OS === 'ios') {
      await Linking.openURL(IOS_SETTINGS_URL)
    } else {
      console.error(`Cannot open device settings on unsupported OS: ${Platform.OS}`)
    }

    setShowSettingsPopup(false)
  }

  const onOpenSettingsDismissed = () => {
    setShowSettingsPopup(false)
  }

  const toggleSwitch = async (value: boolean) => {
    if (value && !biometryAvailable) {
      setShowSettingsPopup(true)
      return
    }

    // If the user is toggling biometrics on/off they need
    // to first authenticate before this action is accepted
    if (screenUsage === UseBiometryUsage.ToggleOnOff) {
      setCanSeeCheckPIN(true)
      return
    }

    setBiometryEnabled((previousState) => !previousState)
  }

  const onAuthenticationComplete = async (status: boolean) => {
    // If successfully authenticated the toggle may proceed.
    if (status) {
      const newValue = !biometryEnabled
      setBiometryEnabled(newValue)

      try {
        if (newValue) {
          await commitWalletToKeychain(newValue)
        } else {
          await disableBiometrics()
        }
      } finally {
        dispatch({
          type: DispatchAction.USE_BIOMETRY,
          payload: [newValue],
        })
      }
    }
    setCanSeeCheckPIN(false)
  }

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.container}>
        <AlertModal
          title={t('Biometry.EnabledTitle')}
          description={t('Biometry.EnabledDescription')}
          visible={showSettingsPopup}
          onAccept={onOpenSettingsTouched}
          onCancel={onOpenSettingsDismissed}
          buttonTitle={t('Biometry.OpenSettings')}
        />
        <View style={styles.textContainer}>
          {biometryAvailable ? (
            <View>
              <Text style={TextTheme.normal}>{t('Biometry.EnabledText1')}</Text>
              <Text></Text>
              <Text style={TextTheme.normal}>{t('Biometry.EnabledText2')}</Text>
            </View>
          ) : (
            <View>
              <Text style={TextTheme.normal}>{t('Biometry.NotEnabledText1')}</Text>
              <Text></Text>
              <Text style={TextTheme.normal}>{t('Biometry.NotEnabledText2')}</Text>
            </View>
          )}
        </View>
        <View style={styles.switchContainer}>
          <Pressable accessible accessibilityLabel={t('Biometry.Toggle')} accessibilityRole={'switch'}>
            <Switch
              trackColor={{ false: ColorPalette.grayscale.lightGrey, true: ColorPalette.brand.primaryDisabled }}
              thumbColor={biometryEnabled ? ColorPalette.brand.primary : ColorPalette.grayscale.mediumGrey}
              ios_backgroundColor={ColorPalette.grayscale.lightGrey}
              onValueChange={toggleSwitch}
              value={biometryEnabled}
              // disabled={!biometryAvailable}
            />
          </Pressable>
          <Text style={TextTheme.normal}>{t('Biometry.UseToUnlock')}</Text>
        </View>
        <View style={styles.imageContainer}>
          <FingerprintImage />
        </View>
        {screenUsage === UseBiometryUsage.InitialSetup && (
          <View style={styles.controlsContainer}>
            {biometryEnabled ? (
              <Button
                title={t('Global.Continue')}
                accessibilityLabel={t('Global.Continue')}
                onPress={continueTouched}
                buttonType={ButtonType.Primary}
              />
            ) : (
              <Button
                title={t('Biometry.Skip')}
                accessibilityLabel={t('Biometry.Skip')}
                onPress={continueTouched}
                buttonType={ButtonType.Secondary}
              />
            )}
          </View>
        )}
      </ScrollView>
      <View style={styles.loaderContainer}>{isLoading && <Loader size={styles.loaderContainer.minHeight} />}</View>
      <Modal
        style={{ backgroundColor: ColorPalette.brand.primaryBackground }}
        visible={canSeeCheckPIN}
        transparent={false}
        animationType={'slide'}
      >
        <PINEnter usage={PINEntryUsage.PINCheck} setAuthenticated={onAuthenticationComplete} />
      </Modal>
    </SafeAreaView>
  )
}

export default UseBiometry
