import { Screens, Stacks } from '@bifold/core'
import { hitSlop } from '@bifold/core/src/constants'
import { HomeStackParams } from '@bifold/core/src/types/navigators'
import { CustomNotification } from '@bifold/core/src/types/notification'
import { DidCommProofExchangeRecord, DidCommProofState } from '@credo-ts/didcomm'
import { HekaTheme, useHekaTheme } from '@heka-wallet/shared'
import { useNavigation } from '@react-navigation/native'
import { StackNavigationProp } from '@react-navigation/stack'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import Icon from 'react-native-vector-icons/MaterialIcons'

import { useNotificationDecline } from '../../hooks/useNotificationDecline'
import { NotificationRecord } from '../../utils/useNotifications'
import { ExchangeRecordDisplay } from '../misc/ExchangeRecordDisplay'
import ActionWarningModal from '../modals/ActionWarningModal'

import { NotificationType } from './NotificationType'

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

export { NotificationType }

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

const NotificationDeclineModal: React.FC<NotificationDeclineModalProps> = ({
  visible,
  onClose,
  notificationType,
  notificationRecord,
  customNotification,
}) => {
  const notificationDecline = useNotificationDecline(notificationType, notificationRecord, onClose, customNotification)

  if (!notificationDecline) return null
  return (
    <ActionWarningModal
      usage={notificationDecline.modalUsage}
      visible={visible}
      onSubmit={notificationDecline.decline}
      onCancel={onClose}
    />
  )
}
