import { HekaTheme, useHekaTheme } from '@heka-wallet/shared'
import {
  BifoldError,
  Button,
  ButtonType,
  DispatchAction,
  EventTypes,
  Screens,
  TOKENS,
  useAuth,
  useServices,
  useStore,
} from '@hyperledger/aries-bifold-core'
import {
  attemptLockoutBaseRules,
  attemptLockoutThresholdRules,
  minPINLength,
} from '@hyperledger/aries-bifold-core/App/constants'
import { hashPIN } from '@hyperledger/aries-bifold-core/App/utils/crypto'
import { useNavigation, CommonActions } from '@react-navigation/native'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View, DeviceEventEmitter, InteractionManager } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import PinKeyPad from '../components/misc/PinKeyPad'
import { AlertModal } from '../components/modals'
import { Loader } from '../components/views/LoadingView'

const useStyles = ({ TextTheme, ColorPallet, Spacing }: HekaTheme) => {
  return StyleSheet.create({
    screenContainer: {
      height: '100%',
      backgroundColor: ColorPallet.brand.primaryBackground,
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

export enum PINEntryUsage {
  PINCheck,
  WalletUnlock,
}

const PINEnter: React.FC<PINEnterProps> = ({ setAuthenticated, usage = PINEntryUsage.WalletUnlock }) => {
  const { t } = useTranslation()
  const { checkPIN, getWalletCredentials, isBiometricsActive, disableBiometrics } = useAuth()
  const [store, dispatch] = useStore()
  const [displayLockoutWarning, setDisplayLockoutWarning] = useState(false)
  const [biometricsErr, setBiometricsErr] = useState(false)
  const navigation = useNavigation()
  const [alertModalVisible, setAlertModalVisible] = useState<boolean>(false)
  const [biometricsEnrollmentChange, setBiometricsEnrollmentChange] = useState<boolean>(false)
  const [logger] = useServices([TOKENS.UTIL_LOGGER])

  const [isPinChecking, setIsPinChecking] = useState(false)

  const theme = useHekaTheme()
  const styles = useStyles(theme)

  const gotoPostAuthScreens = useCallback(() => {
    if (store.onboarding.postAuthScreens.length) {
      const screen = store.onboarding.postAuthScreens[0]
      if (screen) {
        navigation.navigate(screen as never)
      }
    }
  }, [navigation, store.onboarding.postAuthScreens])

  // listen for biometrics error event
  useEffect(() => {
    const handle = DeviceEventEmitter.addListener(EventTypes.BIOMETRY_ERROR, (value?: boolean) => {
      const newVal = value === undefined ? !biometricsErr : value
      setBiometricsErr(newVal)
    })

    return () => {
      handle.remove()
    }
  }, [biometricsErr])

  // This method is used to notify the app that the user is able to receive another lockout penalty
  const unMarkServedPenalty = useCallback(() => {
    dispatch({
      type: DispatchAction.ATTEMPT_UPDATED,
      payload: [
        {
          loginAttempts: store.loginAttempt.loginAttempts,
          lockoutDate: store.loginAttempt.lockoutDate,
          servedPenalty: false,
        },
      ],
    })
  }, [dispatch, store.loginAttempt.lockoutDate, store.loginAttempt.loginAttempts])

  const attemptLockout = async (penalty: number) => {
    // set the attempt lockout time
    dispatch({
      type: DispatchAction.ATTEMPT_UPDATED,
      payload: [
        { loginAttempts: store.loginAttempt.loginAttempts, lockoutDate: Date.now() + penalty, servedPenalty: false },
      ],
    })
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: Screens.AttemptLockout }],
      })
    )
  }

  const getLockoutPenalty = (attempts: number): number | undefined => {
    let penalty = attemptLockoutBaseRules[attempts]
    if (
      !penalty &&
      attempts >= attemptLockoutThresholdRules.attemptThreshold &&
      !(attempts % attemptLockoutThresholdRules.attemptIncrement)
    ) {
      penalty = attemptLockoutThresholdRules.attemptPenalty
    }
    return penalty
  }

  const loadWalletCredentials = async () => {
    if (usage === PINEntryUsage.PINCheck) {
      return
    }

    const creds = await getWalletCredentials()
    if (creds && creds.key) {
      // remove lockout notification
      dispatch({
        type: DispatchAction.LOCKOUT_UPDATED,
        payload: [{ displayNotification: false }],
      })

      // reset login attempts if login is successful
      dispatch({
        type: DispatchAction.ATTEMPT_UPDATED,
        payload: [{ loginAttempts: 0 }],
      })

      setAuthenticated(true)
      gotoPostAuthScreens()
    }
  }

  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(async () => {
      if (!store.preferences.useBiometry) {
        return
      }

      try {
        const active = await isBiometricsActive()
        if (!active) {
          // biometry state has changed, display message and disable biometry
          setBiometricsEnrollmentChange(true)
          await disableBiometrics()
          dispatch({
            type: DispatchAction.USE_BIOMETRY,
            payload: [false],
          })
        }
        await loadWalletCredentials()
      } catch (error) {
        logger.error(`error checking biometrics / loading credentials: ${JSON.stringify(error)}`)
      }
    })

    return handle.cancel
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // check number of login attempts and determine if app should apply lockout
    const attempts = store.loginAttempt.loginAttempts
    const penalty = getLockoutPenalty(attempts)
    if (penalty && !store.loginAttempt.servedPenalty) {
      // only apply lockout if user has not served their penalty
      attemptLockout(penalty)
    }

    // display warning if we are one away from a lockout
    const displayWarning = !!getLockoutPenalty(attempts + 1)
    setDisplayLockoutWarning(displayWarning)
  }, [store.loginAttempt.loginAttempts]) // eslint-disable-line react-hooks/exhaustive-deps

  const unlockWalletWithPIN = useCallback(async (PIN: string) => {
    try {
      setIsPinChecking(true)
      const result = await checkPIN(PIN)

      if (store.loginAttempt.servedPenalty) {
        // once the user starts entering their PIN, unMark them as having served their lockout penalty
        unMarkServedPenalty()
      }

      if (!result) {
        const newAttempt = store.loginAttempt.loginAttempts + 1
        if (!getLockoutPenalty(newAttempt)) {
          // skip displaying modals if we are going to lockout
          setAlertModalVisible(true)
        }

        // log incorrect login attempts
        dispatch({
          type: DispatchAction.ATTEMPT_UPDATED,
          payload: [{ loginAttempts: newAttempt }],
        })

        return false
      }

      // reset login attempts if login is successful
      dispatch({
        type: DispatchAction.ATTEMPT_UPDATED,
        payload: [{ loginAttempts: 0 }],
      })

      // remove lockout notification if login is successful
      dispatch({
        type: DispatchAction.LOCKOUT_UPDATED,
        payload: [{ displayNotification: false }],
      })

      setAuthenticated(true)
      gotoPostAuthScreens()
      return true
    } catch (err: unknown) {
      const error = new BifoldError(t('Error.Title1041'), t('Error.Message1041'), (err as Error)?.message ?? err, 1041)
      DeviceEventEmitter.emit(EventTypes.ERROR_ADDED, error)
      return false
    } finally {
      setIsPinChecking(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const clearAlertModal = useCallback(() => {
    switch (usage) {
      case PINEntryUsage.PINCheck:
        setAlertModalVisible(false)
        setAuthenticated(false)
        break

      default:
        setAlertModalVisible(false)

        break
    }

    setAlertModalVisible(false)
  }, [setAuthenticated, usage])

  const verifyPIN = useCallback(async (PIN: string) => {
    try {
      const credentials = await getWalletCredentials()
      if (!credentials) {
        throw new Error('Problem')
      }

      const key = await hashPIN(PIN, credentials.salt)

      if (credentials.key !== key) {
        setAlertModalVisible(true)
        return false
      }

      setAuthenticated(true)
      return true
    } catch (err: unknown) {
      const error = new BifoldError(t('Error.Title1042'), t('Error.Message1042'), (err as Error)?.message ?? err, 1042)
      DeviceEventEmitter.emit(EventTypes.ERROR_ADDED, error)
      return false
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // both of the async functions called in this function are completely wrapped in trycatch
  const onPINInputCompleted = useCallback(
    async (PIN: string) => {
      if (PIN.length !== minPINLength) return false

      if (usage === PINEntryUsage.PINCheck) {
        const valid = await verifyPIN(PIN)
        if (!valid) {
          setAlertModalVisible(true)
          return false
        }
      }

      if (usage === PINEntryUsage.WalletUnlock) {
        const valid = await unlockWalletWithPIN(PIN)
        if (!valid) {
          return false
        }
      }

      return true
    },
    [unlockWalletWithPIN, usage, verifyPIN]
  )

  const displayHelpText = () => {
    if (store.lockout.displayNotification) {
      return (
        <>
          <Text style={styles.textTitle}>{t('PINEnter.ReEnterPIN')}</Text>
          <Text style={styles.helpText}>{t('PINEnter.LockedOut')}</Text>
        </>
      )
    }

    if (biometricsEnrollmentChange) {
      return (
        <>
          <Text style={styles.helpText}>{t('PINEnter.BiometricsChanged')}</Text>
          <Text style={styles.helpText}>{t('PINEnter.BiometricsChangedEnterPIN')}</Text>
        </>
      )
    }

    if (biometricsErr) {
      return (
        <>
          <Text style={styles.helpText}>{t('PINEnter.BiometricsError')}</Text>
          <Text style={styles.helpText}>{t('PINEnter.BiometricsErrorEnterPIN')}</Text>
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
