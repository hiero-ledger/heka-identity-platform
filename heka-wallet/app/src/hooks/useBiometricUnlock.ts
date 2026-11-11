import { DispatchAction, EventTypes, TOKENS, useAuth, useServices, useStore } from '@bifold/core'
import { useCallback, useEffect, useRef, useState } from 'react'
import { DeviceEventEmitter, InteractionManager } from 'react-native'

import { PINEntryUsage } from './usePinUnlock'

interface BiometricUnlock {
  // Unlocks with the wallet secret from the keychain (the biometric prompt); a no-op for a PIN check.
  loadWalletCredentials: () => Promise<void>
  biometricsErr: boolean
  biometricsEnrollmentChange: boolean
}

// Runs the biometric unlock once on mount and tracks biometry errors and enrollment changes.
export const useBiometricUnlock = (
  usage: PINEntryUsage,
  setAuthenticated: (status: boolean) => void
): BiometricUnlock => {
  const { getWalletSecret, isBiometricsActive, disableBiometrics } = useAuth()
  const [store, dispatch] = useStore()
  const [logger] = useServices([TOKENS.UTIL_LOGGER])
  const [biometricsErr, setBiometricsErr] = useState(false)
  const [biometricsEnrollmentChange, setBiometricsEnrollmentChange] = useState<boolean>(false)

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

  const loadWalletCredentials = useCallback(async () => {
    if (usage === PINEntryUsage.PINCheck) {
      return
    }

    const walletSecret = await getWalletSecret()
    if (walletSecret && walletSecret.key) {
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
    }
  }, [usage, getWalletSecret, dispatch, setAuthenticated])

  // The biometric unlock runs once per mount; later dependency changes must not prompt again.
  const biometryCheckStartedRef = useRef(false)

  useEffect(() => {
    if (biometryCheckStartedRef.current) {
      return
    }

    const handle = InteractionManager.runAfterInteractions(async () => {
      biometryCheckStartedRef.current = true
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
  }, [store.preferences.useBiometry, isBiometricsActive, disableBiometrics, dispatch, loadWalletCredentials, logger])

  return { loadWalletCredentials, biometricsErr, biometricsEnrollmentChange }
}
