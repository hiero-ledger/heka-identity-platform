import { BifoldError, DispatchAction, EventTypes, useAuth, useStore } from '@bifold/core'
import { minPINLength } from '@bifold/core/src/constants'
import { hashPIN } from '@bifold/core/src/utils/crypto'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DeviceEventEmitter } from 'react-native'

import { getLockoutPenalty, usePinLockout } from './usePinLockout'

export enum PINEntryUsage {
  PINCheck,
  WalletUnlock,
}

interface PinUnlock {
  onPINInputCompleted: (PIN: string) => Promise<boolean>
  clearAlertModal: () => void
  alertModalVisible: boolean
  displayLockoutWarning: boolean
  isPinChecking: boolean
}

// Checks an entered PIN: unlocks the wallet (counting wrong attempts for the lockout) or verifies it for a PIN check.
export const usePinUnlock = (usage: PINEntryUsage, setAuthenticated: (status: boolean) => void): PinUnlock => {
  const { t } = useTranslation()
  const { checkWalletPIN, getWalletSecret } = useAuth()
  const [store, dispatch] = useStore()
  const [alertModalVisible, setAlertModalVisible] = useState<boolean>(false)
  const [isPinChecking, setIsPinChecking] = useState(false)
  const { displayLockoutWarning } = usePinLockout()

  const unlockWalletWithPIN = useCallback(
    async (PIN: string) => {
      try {
        setIsPinChecking(true)
        const result = await checkWalletPIN(PIN)

        // ATTEMPT_UPDATED replaces loginAttempt, so the update below also clears a served penalty
        // (servedPenalty and lockoutDate become undefined). It must stay one dispatch: on Android's
        // legacy root a separate unmark renders "attempts at a lockout, penalty not served" on its own
        // and the lockout effect locks the wallet again.
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
        return true
      } catch (err: unknown) {
        const error = new BifoldError(
          t('Error.Title1041'),
          t('Error.Message1041'),
          (err as Error)?.message ?? err,
          1041
        )
        DeviceEventEmitter.emit(EventTypes.ERROR_ADDED, error)
        return false
      } finally {
        setIsPinChecking(false)
      }
    },
    [checkWalletPIN, store.loginAttempt.loginAttempts, dispatch, setAuthenticated, t]
  )

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

  const verifyPIN = useCallback(
    async (PIN: string) => {
      try {
        const walletSecret = await getWalletSecret()
        if (!walletSecret) {
          throw new Error('Wallet secret is not defined')
        }

        const key = await hashPIN(PIN, walletSecret.salt)

        if (walletSecret.key !== key) {
          setAlertModalVisible(true)
          return false
        }

        setAuthenticated(true)
        return true
      } catch (err: unknown) {
        const error = new BifoldError(
          t('Error.Title1042'),
          t('Error.Message1042'),
          (err as Error)?.message ?? err,
          1042
        )
        DeviceEventEmitter.emit(EventTypes.ERROR_ADDED, error)
        return false
      }
    },
    [getWalletSecret, setAuthenticated, t]
  )

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

  return { onPINInputCompleted, clearAlertModal, alertModalVisible, displayLockoutWarning, isPinChecking }
}
