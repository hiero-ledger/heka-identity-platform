import { ConfirmationInputModal, ConfirmationInputType } from '@heka-wallet/shared'
import { MultiKeyStoreInfoWithSelectedElem } from '@keplr-wallet/background'
import { useNavigation } from '@react-navigation/native'
import { StackNavigationProp } from '@react-navigation/stack'
import delay from 'delay'
import { observer } from 'mobx-react-lite'
import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert } from 'react-native'

import { useKeplrStore } from '../../KeplrStoreProvider'
import { KeplrStackParams, Stacks } from '../../navigators/types'

interface Props {
  isVisible: boolean
  onClose: () => void
  keyStore: MultiKeyStoreInfoWithSelectedElem | null
}

export const RemoveAccountModal: React.FC<Props> = observer(({ isVisible, onClose, keyStore }) => {
  const { t } = useTranslation()

  const navigation = useNavigation<StackNavigationProp<KeplrStackParams>>()

  const { keychainStore, keyRingStore } = useKeplrStore()

  const [validationError, setValidationError] = useState(false)

  const removeAccount = useCallback(
    async (password: string) => {
      if (!keyStore) return

      const index = keyRingStore.multiKeyStoreInfo.indexOf(keyStore)

      if (index >= 0) {
        // TODO: Find a way to remove this
        // Ugly workaround to allow React state to be updated before next 'await' call completion
        await delay(10)

        await keyRingStore.deleteKeyRing(index, password)

        if (keyRingStore.multiKeyStoreInfo.length === 0) {
          await keychainStore.reset()

          navigation.reset({
            index: 0,
            routes: [{ name: Stacks.RegisterStack }],
          })
        }
      }
    },
    [keyStore, keychainStore, keyRingStore, navigation]
  )

  const onConfirm = useCallback(
    async (password: string) => {
      const isValidPassword = await keyRingStore.checkPassword(password)

      if (!isValidPassword) {
        setValidationError(true)
        return
      }

      try {
        await removeAccount(password)
      } catch (e) {
        console.error(e)
        Alert.alert(t('Error.Problem'))
      } finally {
        onClose()
      }
    },
    [t, removeAccount, keyRingStore, onClose]
  )

  const onCancel = useCallback(() => {
    onClose()
    setValidationError(false)
  }, [onClose])

  const accountName = keyStore?.meta?.name ?? t('Crypto.Account.KeplrAccount')
  return (
    <ConfirmationInputModal
      isVisible={isVisible}
      title={t('Crypto.Account.RemoveAccount', { name: accountName })}
      inputType={ConfirmationInputType.Password}
      onValueChanged={() => setValidationError(false)}
      onConfirm={onConfirm}
      onCancel={onCancel}
      doneButtonTitle={t('Common.Confirm')}
      errorState={validationError}
    />
  )
})

export const useRemoveAccountModal = () => {
  const [isVisible, setIsVisible] = useState(false)
  const [keyStore, setKeyStore] = useState<MultiKeyStoreInfoWithSelectedElem | null>(null)

  const show = useCallback((keyStore: MultiKeyStoreInfoWithSelectedElem) => {
    setKeyStore(keyStore)
    setIsVisible(true)
  }, [])

  const hide = useCallback(() => {
    setKeyStore(null)
    setIsVisible(false)
  }, [])

  return { isVisible, show, hide, keyStore }
}
