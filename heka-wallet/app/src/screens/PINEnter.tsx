import { Button, ButtonType, TOKENS, useServices, useStore } from '@bifold/core'
import { defaultAutoLockTime } from '@bifold/core/src/constants'
import { HekaTheme, useHekaTheme } from '@heka-wallet/shared'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import PinKeyPad from '../components/misc/PinKeyPad'
import { AlertModal } from '../components/modals'
import { Loader } from '../components/views/LoadingView'
import { useBiometricUnlock } from '../hooks/useBiometricUnlock'
import { PINEntryUsage, usePinUnlock } from '../hooks/usePinUnlock'

export { PINEntryUsage }

const useStyles = ({ TextTheme, ColorPalette, Spacing }: HekaTheme) => {
  return StyleSheet.create({
    screenContainer: {
      height: '100%',
      backgroundColor: ColorPalette.brand.primaryBackground,
      padding: Spacing.lg,
    },
    textContainer: {
      paddingTop: 20,
    },
    loaderContainer: {
      flex: 1,
      minHeight: Spacing.xxxl,
      flexDirection: 'column',
      justifyContent: 'flex-end',
    },
    textTitle: {
      ...TextTheme.headingFour,
      marginBottom: Spacing.md,
    },
    buttonContainer: {
      width: '100%',
    },
    helpText: {
      ...TextTheme.normal,
      alignSelf: 'flex-start',
      textAlign: 'left',
      marginBottom: Spacing.md,
    },
  })
}

interface PINEnterProps {
  setAuthenticated: (status: boolean) => void
  usage?: PINEntryUsage
}

const PINEnter: React.FC<PINEnterProps> = ({ setAuthenticated, usage = PINEntryUsage.WalletUnlock }) => {
  const { t } = useTranslation()
  const [store] = useStore()
  const [{ customAutoLockTimes }] = useServices([TOKENS.CONFIG])
  const defaultAutoLockoutTime = customAutoLockTimes?.default?.time ?? defaultAutoLockTime

  const theme = useHekaTheme()
  const styles = useStyles(theme)

  const { loadWalletCredentials, biometricsErr, biometricsEnrollmentChange } = useBiometricUnlock(
    usage,
    setAuthenticated
  )
  const { onPINInputCompleted, clearAlertModal, alertModalVisible, displayLockoutWarning, isPinChecking } =
    usePinUnlock(usage, setAuthenticated)

  const displayHelpText = () => {
    if (store.lockout.displayNotification) {
      return (
        <>
          <Text style={styles.textTitle}>{t('PINEnter.ReEnterPIN')}</Text>
          <Text style={styles.helpText}>
            {t('PINEnter.LockedOut', {
              time: String(store.preferences.autoLockTime ?? defaultAutoLockoutTime),
            })}
          </Text>
        </>
      )
    }

    const biometricsKeys = biometricsEnrollmentChange
      ? { message: 'PINEnter.BiometricsChanged', enterPIN: 'PINEnter.BiometricsChangedEnterPIN' }
      : biometricsErr
        ? { message: 'PINEnter.BiometricsError', enterPIN: 'PINEnter.BiometricsErrorEnterPIN' }
        : undefined

    if (biometricsKeys) {
      return (
        <>
          <Text style={styles.helpText}>{t(biometricsKeys.message)}</Text>
          <Text style={styles.helpText}>{t(biometricsKeys.enterPIN)}</Text>
        </>
      )
    }

    return <Text style={styles.textTitle}>{t('PINEnter.EnterPIN')}</Text>
  }

  return (
    <SafeAreaView>
      <View style={styles.screenContainer}>
        <View style={styles.textContainer}>
          {displayHelpText()}
          <AlertModal
            title={t('PINEnter.IncorrectPIN')}
            description={`${t('PINEnter.RepeatPIN')} \n${displayLockoutWarning ? t('PINEnter.AttemptLockoutWarning') : ''}`}
            visible={alertModalVisible}
            onCancel={clearAlertModal}
            buttonTitle={t('Global.Okay')}
          />
        </View>
        <View style={styles.loaderContainer}>
          {isPinChecking && <Loader size={styles.loaderContainer.minHeight} />}
        </View>
        <PinKeyPad onPinEntered={onPINInputCompleted} />
        {store.preferences.useBiometry && usage === PINEntryUsage.WalletUnlock && (
          <>
            <View style={[styles.buttonContainer, { marginTop: 10 }]}>
              <Button
                title={t('PINEnter.BiometricsUnlock')}
                buttonType={ButtonType.Secondary}
                accessibilityLabel={t('PINEnter.BiometricsUnlock')}
                onPress={loadWalletCredentials}
              />
            </View>
          </>
        )}
      </View>
    </SafeAreaView>
  )
}

export default PINEnter
