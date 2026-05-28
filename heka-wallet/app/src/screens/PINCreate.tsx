import { BifoldError, DispatchAction, EventTypes, Screens, TOKENS, useAuth, useServices, useStore } from '@bifold/core'
import { createPINValidations } from '@bifold/core/src/utils/PINValidation'
import { HekaTheme, useHekaTheme } from '@heka-wallet/shared'
import { ParamListBase, useNavigation } from '@react-navigation/native'
import { StackScreenProps } from '@react-navigation/stack'
import React, { useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View, DeviceEventEmitter, Text } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import PinKeyPad from '../components/misc/PinKeyPad'
import { AlertModal } from '../components/modals/AlertModal'
import { Loader } from '../components/views/LoadingView'
import { useHekaAgent } from '../utils/agent'

const useStyles = ({ TextTheme, Spacing }: HekaTheme) => {
  return StyleSheet.create({
    container: {
      height: '100%',
      padding: Spacing.lg,
    },
    textContainer: {
      flex: 1,
      gap: Spacing.xxl,
    },
    textTitle: TextTheme.headingFour,
    textDetails: TextTheme.normal,
    loaderContainer: {
      minHeight: Spacing.xxl,
      justifyContent: 'flex-end',
    },
  })
}

interface PINCreateProps extends StackScreenProps<ParamListBase, Screens.CreatePIN> {
  setAuthenticated: (status: boolean) => void
}

interface ModalState {
  visible: boolean
  title: string
  message: string
  onModalDismiss?: () => void
}

enum PinEntry {
  Old,
  New,
  NewRepeat,
}

const PINCreate: React.FC<PINCreateProps> = ({ setAuthenticated, route }) => {
  const updatePin = (route.params as any)?.updatePin

  const [store, dispatch] = useStore()
  const { t } = useTranslation()

  const theme = useHekaTheme()
  const styles = useStyles(theme)

  const { agent } = useHekaAgent()

  const { setPIN: setWalletPIN, checkWalletPIN, rekeyWallet } = useAuth()

  const [pinEntry, setPinEntry] = useState(updatePin ? PinEntry.Old : PinEntry.New)

  const [PIN, setPIN] = useState('')
  const [PINOld, setPINOld] = useState('')
  const [isPinChecking, setIsPinChecking] = useState(false)

  const [modalState, setModalState] = useState<ModalState>({
    visible: false,
    title: '',
    message: '',
  })
  const navigation = useNavigation()

  const [{ PINSecurity }] = useServices([TOKENS.CONFIG, TOKENS.COMPONENT_BUTTON])

  const createPin = useCallback(async (PIN: string) => {
    try {
      await setWalletPIN(PIN)
      // This will trigger initAgent
      setAuthenticated(true)

      // This dispatch action triggers navigation under-the-hood (since Bifold 3.0.0)
      dispatch({
        type: DispatchAction.DID_CREATE_PIN,
      })
    } catch (err: unknown) {
      const error = new BifoldError(t('Error.Title1040'), t('Error.Message1040'), (err as Error)?.message ?? err, 1040)
      DeviceEventEmitter.emit(EventTypes.ERROR_ADDED, error)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const changePin = useCallback(
    async (oldPIN: string, newPIN: string) => {
      if (!agent) return

      const success = await rekeyWallet(agent, oldPIN, newPIN, store.preferences.useBiometry)
      if (success) {
        setModalState({
          visible: true,
          title: t('PINChange.PinChangeSuccessTitle'),
          message: t('PINChange.PinChangeSuccessMessage'),
          onModalDismiss: () => {
            navigation.navigate(Screens.Settings as never)
          },
        })
      }
    },
    [agent] // eslint-disable-line react-hooks/exhaustive-deps
  )

  const onPinOldSet = useCallback(
    async (value: string) => {
      setIsPinChecking(true)
      const valid = await checkWalletPIN(value)
      setIsPinChecking(false)

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
    [PIN, checkWalletPIN, t] // eslint-disable-line react-hooks/exhaustive-deps
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

      updatePin ? await changePin(PINOld, PIN) : await createPin(PIN)

      setIsPinChecking(false)

      return true
    },
    [PIN, PINOld, changePin, createPin, t, updatePin]
  )

  const { title, details } = useMemo(() => {
    switch (pinEntry) {
      case PinEntry.New: {
        if (updatePin) {
          return {
            title: t('PINCreate.EnterNewPinTitle'),
            details: t('PINCreate.EnterNewPinText'),
          }
        } else {
          return {
            title: t('PINCreate.CreatePinTitle'),
            details: t('PINCreate.CreatePinText'),
          }
        }
      }
      case PinEntry.NewRepeat: {
        if (updatePin) {
          return {
            title: t('PINCreate.ReEnterNewPinTitle'),
            details: t('PINCreate.ReEnterNewPinText'),
          }
        } else {
          return {
            title: t('PINCreate.ReEnterPinTitle'),
            details: t('PINCreate.ReEnterPinText'),
          }
        }
      }
      case PinEntry.Old:
        return {
          title: t('PINCreate.EnterOldPinTitle'),
          details: t('PINCreate.EnterOldPinText'),
        }
    }
  }, [pinEntry, t, updatePin])

  return (
    <SafeAreaView>
      <View style={styles.container}>
        <View style={styles.textContainer}>
          <Text style={styles.textTitle}>{title}</Text>
          <Text style={styles.textDetails}>{details}</Text>
          <AlertModal
            title={modalState.title}
            description={modalState.message}
            visible={modalState.visible}
            onCancel={() => {
              if (modalState.onModalDismiss) {
                modalState.onModalDismiss()
              }
              setModalState({ ...modalState, visible: false, onModalDismiss: undefined })
            }}
          />
        </View>
        <View style={styles.loaderContainer}>
          {isPinChecking && <Loader size={styles.loaderContainer.minHeight} />}
        </View>
        {pinEntry === PinEntry.Old && <PinKeyPad onPinEntered={onPinOldSet} />}
        {pinEntry === PinEntry.New && <PinKeyPad onPinEntered={onPinSet} />}
        {pinEntry === PinEntry.NewRepeat && <PinKeyPad onPinEntered={onPinRepeatSet} />}
      </View>
    </SafeAreaView>
  )
}

export default PINCreate
