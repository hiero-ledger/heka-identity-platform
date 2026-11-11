import { BifoldError, EventTypes, useStore } from '@bifold/core'
import { CustomNotification } from '@bifold/core/src/types/notification'
import { useOptionalAgent } from '@bifold/react-hooks'
import { markProofAsViewed } from '@bifold/verifier'
import { DidCommProofExchangeRecord, DidCommProofState } from '@credo-ts/didcomm'
import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { DeviceEventEmitter } from 'react-native'

import { NotificationType } from '../components/cards/NotificationType'
import { ModalUsage } from '../components/modals/ActionWarningModal'
import { NotificationRecord } from '../utils/useNotifications'

interface NotificationDecline {
  modalUsage: ModalUsage
  decline: () => Promise<void>
}

/**
 * Declines (or dismisses) a notification: a DIDComm proof request or credential offer, or a custom
 * notification. Returns null for notification types that cannot be declined.
 */
export function useNotificationDecline(
  notificationType: NotificationType,
  notificationRecord: NotificationRecord,
  onClose: () => void,
  customNotification?: CustomNotification
): NotificationDecline | null {
  const { t } = useTranslation()
  const { agent } = useOptionalAgent()

  const [, dispatch] = useStore()

  const onProofRequestDecline = useCallback(async () => {
    if (!agent) return
    try {
      await agent.didcomm.proofs.declineRequest({ proofExchangeRecordId: notificationRecord.id })
    } catch (error: unknown) {
      const errorMessage = new BifoldError(
        t('Error.Title1028'),
        t('Error.Message1028'),
        (error as Error)?.message ?? error,
        1028
      )
      DeviceEventEmitter.emit(EventTypes.ERROR_ADDED, errorMessage)
    }

    onClose()
  }, [t, agent, notificationRecord, onClose])

  const onProofRequestDismiss = useCallback(async () => {
    if (!agent) return
    await markProofAsViewed(agent, notificationRecord as DidCommProofExchangeRecord)
  }, [agent, notificationRecord])

  const onCredentialOfferDecline = useCallback(async () => {
    if (!agent) return
    try {
      await agent.didcomm.credentials.declineOffer({ credentialExchangeRecordId: notificationRecord.id })
    } catch (error: unknown) {
      const errorMessage = new BifoldError(
        t('Error.Title1028'),
        t('Error.Message1028'),
        (error as Error)?.message ?? error,
        1028
      )
      DeviceEventEmitter.emit(EventTypes.ERROR_ADDED, errorMessage)
    }

    onClose()
  }, [t, agent, notificationRecord, onClose])

  const onCustomNotificationDecline = useCallback(async () => {
    customNotification?.onCloseAction(dispatch)
    onClose()
  }, [dispatch, customNotification, onClose])

  return useMemo(() => {
    if (notificationType === NotificationType.ProofRequest) {
      const isProofRequestCompleted =
        (notificationRecord as DidCommProofExchangeRecord).state === DidCommProofState.Done
      const decline = isProofRequestCompleted ? onProofRequestDismiss : onProofRequestDecline
      return { modalUsage: ModalUsage.ProofRequestDecline, decline }
    } else if (notificationType === NotificationType.CredentialOffer) {
      return { modalUsage: ModalUsage.CredentialOfferDecline, decline: onCredentialOfferDecline }
    } else if (notificationType === NotificationType.Custom) {
      return { modalUsage: ModalUsage.CustomNotificationDecline, decline: onCustomNotificationDecline }
    }
    return null
  }, [
    notificationType,
    notificationRecord,
    onProofRequestDismiss,
    onProofRequestDecline,
    onCredentialOfferDecline,
    onCustomNotificationDecline,
  ])
}
