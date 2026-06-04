import { useAuth } from '@bifold/core'
import { hashPIN } from '@bifold/core/src/utils/crypto'
import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert } from 'react-native'

import { ConfirmationInputModal, ConfirmationInputType } from '../modals'

const PIN_LENGTH = 6

interface Props {
  title?: string
  onSuccess: () => void
  onClose: () => void
}

export const PinConfirmation: React.FC<Props> = ({ title, onSuccess, onClose }) => {
  const { t } = useTranslation()

  const { getWalletSecret } = useAuth()

  const [validationError, setValidationError] = useState(false)

  const onConfirm = useCallback(
    async (pin: string) => {
      try {
        const walletSecret = await getWalletSecret()

        if (!walletSecret) {
          throw new Error('PinConfirmation: Got undefined wallet secret')
        }

        const pinHash = await hashPIN(pin, walletSecret.salt)
        const isPinValid = pinHash === walletSecret.key

        if (isPinValid) {
          onSuccess()
        } else {
          setValidationError(true)
        }
      } catch (e) {
        console.error(e)
        Alert.alert(t('Error.Problem'))
      }
    },
    [getWalletSecret, onSuccess, t]
  )

  const onPinChanged = useCallback((pin: string) => {
    if (pin.length < PIN_LENGTH) {
      setValidationError(false)
    }
  }, [])

  return (
    <ConfirmationInputModal
      title={title ?? t('Global.Confirm')}
      inputType={ConfirmationInputType.PIN}
      doneButtonTitle={t('Global.Confirm')}
      onValueChanged={onPinChanged}
      onConfirm={onConfirm}
      onCancel={onClose}
      errorState={validationError}
    />
  )
}
