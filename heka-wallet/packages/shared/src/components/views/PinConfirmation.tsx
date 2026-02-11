import { useAuth } from '@hyperledger/aries-bifold-core'
import { hashPIN } from '@hyperledger/aries-bifold-core/App/utils/crypto'
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

  const { getWalletCredentials } = useAuth()

  const [validationError, setValidationError] = useState(false)

  const onConfirm = useCallback(
    async (pin: string) => {
      try {
        const credentials = await getWalletCredentials()

        if (!credentials) {
          throw new Error('checkPin: Got undefined wallet credentials')
        }

        const pinHash = await hashPIN(pin, credentials.salt)
        const isPinValid = pinHash === credentials.key

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
    [getWalletCredentials, onSuccess, t]
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
