import { BifoldError, EventTypes } from '@hyperledger/aries-bifold-core'
import * as React from 'react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DeviceEventEmitter } from 'react-native'

import { AlertModal } from './AlertModal'

export const ErrorModal: React.FC = () => {
  const { t } = useTranslation()

  const [modalVisible, setModalVisible] = useState<boolean>(false)
  const [error, setError] = useState<BifoldError>()

  const closeModal = useCallback(() => setModalVisible(false), [])

  useEffect(() => {
    const errorAddedHandle = DeviceEventEmitter.addListener(EventTypes.ERROR_ADDED, (err: BifoldError) => {
      if (err.title && err.message) {
        setError(err)
        setModalVisible(true)
      }
    })

    const errorRemovedHandle = DeviceEventEmitter.addListener(EventTypes.ERROR_REMOVED, () => {
      setError(undefined)
      setModalVisible(false)
    })

    return () => {
      errorAddedHandle.remove()
      errorRemovedHandle.remove()
    }
  }, [])

  const formattedMessageForError = (err: BifoldError | null | undefined): string | undefined => {
    if (!err) {
      return undefined
    }

    return `${t('Error.ErrorCode')}: ${err.code} \n${err.message}`
  }
  return (
    <AlertModal
      visible={modalVisible}
      title={error?.title ?? t('Error.Unknown')}
      description={formattedMessageForError(error)}
      onCancel={closeModal}
    />
  )
}
