import { useStore, EventTypes, BifoldError, Screens, Stacks } from '@bifold/core'
import { hitSlop } from '@bifold/core/src/constants'
import { HomeStackParams } from '@bifold/core/src/types/navigators'
import { CustomNotification } from '@bifold/core/src/types/notification'
import { useAgent } from '@bifold/react-hooks'
import { markProofAsViewed } from '@bifold/verifier'
import { DidCommCredentialExchangeRecord, DidCommProofExchangeRecord, DidCommProofState } from '@credo-ts/didcomm'
import { HekaTheme, useHekaTheme } from '@heka-wallet/shared'
import { useNavigation } from '@react-navigation/native'
import { StackNavigationProp } from '@react-navigation/stack'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DeviceEventEmitter, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import Icon from 'react-native-vector-icons/MaterialIcons'

import { NotificationRecord } from '../../utils/useNotifications'
import { ExchangeRecordDisplay } from '../misc/ExchangeRecordDisplay'
import ActionWarningModal, { ModalUsage } from '../modals/ActionWarningModal'

const CARD_WIDTH = 300
const CARD_HEIGHT = 120

const useStyles = ({ BorderWidth, BorderRadius, ColorPalette, Spacing, TextTheme }: HekaTheme) =>
  StyleSheet.create({
    container: {
      borderWidth: BorderWidth.small,
      borderRadius: BorderRadius.big,
      borderColor: ColorPalette.grayscale.lightGrey,
      padding: Spacing.md,
      gap: Spacing.sm,
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
    },
    headerContainer: {
      flexDirection: 'row',
    },
    headerText: {
      ...TextTheme.title,
      flexGrow: 1,
    },
  })

export enum NotificationType {
  CredentialOffer = 'Offer',
  ProofRequest = 'ProofRecord',
  Revocation = 'Revocation',
  Proof = 'Proof',
  Custom = 'Custom',
}

const DISMISSIBLE_NOTIFICATION_TYPES = [
  NotificationType.CredentialOffer,
  NotificationType.ProofRequest,
  NotificationType.Custom,
]

interface NotificationOptions {
  title: string
  onPress: () => void
}

const useNotificationOptions = (
  type: NotificationType,
  record: NotificationRecord,
  customNotification?: CustomNotification
): NotificationOptions => {
  const { t } = useTranslation()

  const navigation = useNavigation<StackNavigationProp<HomeStackParams>>()

  switch (type) {
    case NotificationType.CredentialOffer:
      return {
        title: t('Notifications.CredentialOffer'),
        onPress: () => {
          navigation.getParent()?.navigate(Stacks.NotificationStack, {
            screen: Screens.CredentialOffer,
            params: { credentialId: record.id },
          })
        },
      }
    case NotificationType.ProofRequest: {
      const proofRecord = record as DidCommProofExchangeRecord
      const isProofCompleted =
        proofRecord.state === DidCommProofState.Done || proofRecord.state === DidCommProofState.PresentationReceived

      const onPress = isProofCompleted
        ? () => {
            navigation.getParent()?.navigate(Stacks.ContactStack, {
              screen: Screens.ProofDetails,
              params: { recordId: record.id, isHistory: true },
            })
          }
        : () => {
            navigation.getParent()?.navigate(Stacks.NotificationStack, {
              screen: Screens.ProofRequest,
              params: { proofId: record.id },
            })
          }

      return { title: t('Notifications.ProofRequest'), onPress }
    }
    case NotificationType.Proof:
      return {
        title: t('Notifications.ProofPresentation'),
        onPress: () =>
          navigation.getParent()?.navigate(Stacks.NotificationStack, {
            screen: Screens.ProofDetails,
            params: { recordId: record.id, isHistory: true },
          }),
      }
    case NotificationType.Revocation:
      return {
        title: t('Notifications.CredentialRevoked'),
        onPress: () =>
          navigation.getParent()?.navigate(Stacks.NotificationStack, {
            screen: Screens.CredentialDetails,
            params: { credential: record },
          }),
      }
    case NotificationType.Custom:
      return {
        title: t(customNotification?.title as any),
        onPress: () =>
          navigation.getParent()?.navigate(Stacks.NotificationStack, {
            screen: Screens.CustomNotification,
          }),
      }
  }
}

interface Props {
  notificationType: NotificationType
  notificationRecord: NotificationRecord
  customNotification?: CustomNotification
}

export const NotificationCard: React.FC<Props> = ({ notificationType, notificationRecord, customNotification }) => {
  const { t } = useTranslation()

  const theme = useHekaTheme()
  const styles = useStyles(theme)
  const { IconSizes, ColorPalette, TextTheme } = theme

  const [declineModalVisible, setDeclineModalVisible] = useState(false)

  const options = useNotificationOptions(notificationType, notificationRecord, customNotification)

  return (
    <TouchableOpacity onPress={options.onPress} style={styles.container}>
      <View style={styles.headerContainer}>
        <Text style={styles.headerText}>{options.title}</Text>
        {DISMISSIBLE_NOTIFICATION_TYPES.includes(notificationType) && (
          <View>
            <TouchableOpacity
              accessibilityLabel={t('Global.Dismiss')}
              accessibilityRole={'button'}
              onPress={() => setDeclineModalVisible(true)}
              hitSlop={hitSlop}
            >
              <Icon name={'close'} size={IconSizes.medium} color={ColorPalette.brand.text} />
            </TouchableOpacity>
          </View>
        )}
      </View>
      <View>
        {notificationType === NotificationType.Custom ? (
          <Text style={TextTheme.normal}>{t(customNotification?.description as any)}</Text>
        ) : (
          <ExchangeRecordDisplay record={notificationRecord} withBorder={false} />
        )}
      </View>
      <NotificationDeclineModal
        visible={declineModalVisible}
        notificationType={notificationType}
        notificationRecord={notificationRecord}
        onClose={() => setDeclineModalVisible(false)}
      />
    </TouchableOpacity>
  )
}

interface NotificationDeclineModalProps {
  visible?: boolean
  onClose: () => void
  notificationType: NotificationType
  notificationRecord: NotificationRecord
  customNotification?: CustomNotification
}

interface NotificationDeclineModalState {
  modalUsage: ModalUsage
  onSubmit: (record: any) => void
}

const NotificationDeclineModal: React.FC<NotificationDeclineModalProps> = ({
  visible,
  onClose,
  notificationType,
  notificationRecord,
  customNotification,
}) => {
  const { t } = useTranslation()
  const { agent } = useAgent()

  const [, dispatch] = useStore()

  const [state, setState] = useState<NotificationDeclineModalState | null>(null)

  const onProofRequestDecline = useCallback(
    async (proofRecord: DidCommProofExchangeRecord) => {
      if (!agent) return
      try {
        await agent.didcomm.proofs.declineRequest({ proofExchangeRecordId: proofRecord.id })
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
    },
    [t, agent, onClose]
  )

  const onProofRequestDismiss = useCallback(async () => {
    if (!agent) return
    await markProofAsViewed(agent, notificationRecord as DidCommProofExchangeRecord)
  }, [agent, notificationRecord])

  const onCredentialOfferDecline = useCallback(
    async (credentialRecord: DidCommCredentialExchangeRecord) => {
      if (!agent) return
      try {
        await agent.didcomm.credentials.declineOffer({ credentialExchangeRecordId: credentialRecord.id })
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
    },
    [t, agent, onClose]
  )

  const onCustomNotificationDecline = useCallback(async () => {
    customNotification?.onCloseAction(dispatch as any)
    onClose()
  }, [dispatch, customNotification, onClose])

  useEffect(() => {
    if (notificationType === NotificationType.ProofRequest) {
      const isProofRequestCompleted =
        (notificationRecord as DidCommProofExchangeRecord).state === DidCommProofState.Done
      const onSubmit = isProofRequestCompleted ? onProofRequestDismiss : onProofRequestDecline
      setState({ modalUsage: ModalUsage.ProofRequestDecline, onSubmit })
    } else if (notificationType === NotificationType.CredentialOffer) {
      setState({ modalUsage: ModalUsage.CredentialOfferDecline, onSubmit: onCredentialOfferDecline })
    } else if (notificationType === NotificationType.Custom) {
      setState({ modalUsage: ModalUsage.CustomNotificationDecline, onSubmit: onCustomNotificationDecline })
    }
  }, [
    notificationType,
    notificationRecord,
    onProofRequestDismiss,
    onProofRequestDecline,
    onCredentialOfferDecline,
    onCustomNotificationDecline,
  ])

  if (!state) return null
  return (
    <ActionWarningModal
      usage={state.modalUsage}
      visible={visible}
      onSubmit={() => state.onSubmit(notificationRecord)}
      onCancel={onClose}
    />
  )
}
