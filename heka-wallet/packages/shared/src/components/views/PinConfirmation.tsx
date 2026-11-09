import React, { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert } from 'react-native'

import { usePinVerification } from '../../hooks/usePinVerification'
import { ConfirmationInputModal, ConfirmationInputType } from '../modals'

const PIN_LENGTH = 6

interface Props {
  title?: string
  onSuccess: () => void
  onClose: () => void
}

export const PinConfirmation: React.FC<Props> = ({ title, onSuccess, onClose }) => {
  const { t } = useTranslation()

  const { verify, validationError, resetError } = usePinVerification()

  const onConfirm = useCallback(
    async (pin: string) => {
      try {
        if (await verify(pin)) {
          onSuccess()
        }
      } catch {
        // usePinVerification logs the failure
        Alert.alert(t('Error.Problem'))
      }
    },
    [verify, onSuccess, t]
  )

  const onPinChanged = useCallback(
    (pin: string) => {
      if (pin.length < PIN_LENGTH) {
        resetError()
      }
    },
    [resetError]
  )

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
