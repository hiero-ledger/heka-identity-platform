import { BifoldError, DispatchAction, EventTypes, Screens, TOKENS, useAuth, useServices, useStore } from '@bifold/core'
import { createPINValidations } from '@bifold/core/src/utils/PINValidation'
import { useNavigation } from '@react-navigation/native'
import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DeviceEventEmitter } from 'react-native'

import { useHekaAgent } from '../utils/agent'

export interface PinCreationModalState {
  visible: boolean
  title: string
  message: string
  onModalDismiss?: () => void
}

export enum PinEntry {
  Old,
  New,
  NewRepeat,
}

interface PinCreation {
  pinEntry: PinEntry
  isPinChecking: boolean
  modalState: PinCreationModalState
  setModalState: React.Dispatch<React.SetStateAction<PinCreationModalState>>
  onPinOldSet: (value: string) => Promise<boolean>
  onPinSet: (value: string) => Promise<boolean>
  onPinRepeatSet: (value: string) => Promise<boolean>
}

// Creates the wallet PIN, or with `updatePin` checks the old PIN and rekeys the wallet with the new one.
export const usePinCreation = (
  updatePin: boolean | undefined,
  setAuthenticated: (status: boolean) => void
): PinCreation => {
  const [store, dispatch] = useStore()
  const { t } = useTranslation()

  const { agent } = useHekaAgent()

  const { setPIN: setWalletPIN, checkWalletPIN, rekeyWallet } = useAuth()

  const [pinEntry, setPinEntry] = useState(updatePin ? PinEntry.Old : PinEntry.New)

  const [PIN, setPIN] = useState('')
  const [PINOld, setPINOld] = useState('')
  const [isPinChecking, setIsPinChecking] = useState(false)

  const [modalState, setModalState] = useState<PinCreationModalState>({
    visible: false,
    title: '',
    message: '',
  })
  const navigation = useNavigation()

  const [{ PINSecurity }] = useServices([TOKENS.CONFIG, TOKENS.COMPONENT_BUTTON])

  const createPin = useCallback(
    async (PIN: string) => {
      try {
        await setWalletPIN(PIN)
        // This will trigger initAgent
        setAuthenticated(true)

        // This dispatch action triggers navigation under-the-hood (since Bifold 3.0.0)
        dispatch({
          type: DispatchAction.DID_CREATE_PIN,
        })
      } catch (err: unknown) {
        const error = new BifoldError(
          t('Error.Title1040'),
          t('Error.Message1040'),
          (err as Error)?.message ?? err,
          1040
        )
        DeviceEventEmitter.emit(EventTypes.ERROR_ADDED, error)
      }
    },
    [setWalletPIN, setAuthenticated, dispatch, t]
  )

  const changePin = useCallback(
    async (oldPIN: string, newPIN: string): Promise<boolean> => {
      const success = !!agent && (await rekeyWallet(agent, oldPIN, newPIN, store.preferences.useBiometry))
      setModalState(
        success
          ? {
              visible: true,
              title: t('PINChange.PinChangeSuccessTitle'),
              message: t('PINChange.PinChangeSuccessMessage'),
              onModalDismiss: () => {
                navigation.navigate(Screens.Settings as never)
              },
            }
          : {
              visible: true,
              title: t('PINCreate.PinChangeFailedTitle'),
              message: t('PINCreate.PinChangeFailedMessage'),
            }
      )
      return success
    },
    [agent, rekeyWallet, store.preferences.useBiometry, t, navigation]
  )

  const onPinOldSet = useCallback(
    async (value: string) => {
      setIsPinChecking(true)
      let valid: boolean
      try {
        valid = await checkWalletPIN(value)
      } finally {
        setIsPinChecking(false)
      }

      if (!valid) {
        setModalState({
          visible: true,
          title: t('PINCreate.InvalidPIN'),
          message: t(`PINCreate.Message.OldPINIncorrect`),
        })
        return false
      }

      setPINOld(value)
      setPinEntry(PinEntry.New)
      return true
    },
    [checkWalletPIN, t]
  )

  const onPinSet = useCallback(
    async (value: string) => {
      const validations = createPINValidations(value, PINSecurity.rules)
      if (validations.length) {
        for (const validation of validations) {
          if (validation.isInvalid) {
            setModalState({
              visible: true,
              title: t('PINCreate.InvalidPIN'),
              message: t(`PINCreate.Message.${validation.errorName}`),
            })
            return false
          }
        }
      }

      setPIN(value)
      setPinEntry(PinEntry.NewRepeat)
      return true
    },
    [PINSecurity.rules, t]
  )

  const onPinRepeatSet = useCallback(
    async (value: string) => {
      if (value !== PIN) {
        setModalState({
          visible: true,
          title: t('PINCreate.InvalidPIN'),
          message: t('PINCreate.PINsDoNotMatch'),
        })
        return false
      }

      setIsPinChecking(true)
      try {
        if (!updatePin) {
          await createPin(PIN)
          return true
        }
        // A failed change clears the key pad so the user can confirm the new PIN again
        return await changePin(PINOld, PIN)
      } finally {
        setIsPinChecking(false)
      }
    },
    [PIN, PINOld, changePin, createPin, t, updatePin]
  )

  return { pinEntry, isPinChecking, modalState, setModalState, onPinOldSet, onPinSet, onPinRepeatSet }
}
