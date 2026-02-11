import { BasicMessageRecord, CredentialExchangeRecord, ProofExchangeRecord } from '@credo-ts/core'
import { ColorPallet, HekaTheme, useHekaTheme } from '@heka-wallet/shared'
import { Button, ButtonType, Screens, Stacks, TOKENS, useServices } from '@hyperledger/aries-bifold-core'
import { useConnectionByOutOfBandId, useOutOfBandById } from '@hyperledger/aries-bifold-core/App/hooks/connections'
import { TabStacks, DeliveryStackParams } from '@hyperledger/aries-bifold-core/App/types/navigators'
import { CommonActions } from '@react-navigation/native'
import { StackScreenProps } from '@react-navigation/stack'
import React, { useCallback, useEffect, useReducer } from 'react'
import { useTranslation } from 'react-i18next'
import { BackHandler, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Loader } from '../components/views/LoadingView'

type ConnectionProps = StackScreenProps<DeliveryStackParams, Screens.Connection>

type MergeFunction = (current: LocalState, next: Partial<LocalState>) => LocalState

type LocalState = {
  inProgress: boolean
  isInitialized: boolean
  notificationRecord?: any
}

const GoalCodes = {
  proofRequestVerify: 'aries.vc.verify',
  proofRequestVerifyOnce: 'aries.vc.verify.once',
  credentialOffer: 'aries.vc.issue',
} as const

const useStyles = ({ TextTheme }: HekaTheme) =>
  StyleSheet.create({
    container: {
      height: '100%',
      backgroundColor: ColorPallet.brand.modalPrimaryBackground,
      padding: 20,
    },
    pendingBackground: {
      backgroundColor: ColorPallet.brand.modalPrimaryBackground,
    },
    image: {
      marginTop: 20,
    },
    messageContainer: {
      alignItems: 'center',
    },
    messageText: {
      textAlign: 'center',
      marginTop: 30,
      ...TextTheme.headingOne,
    },
    controlsContainer: {
      marginTop: 'auto',
      margin: 20,
    },
  })

const Connection: React.FC<ConnectionProps> = ({ navigation, route }) => {
  const { oobRecordId } = route.params
  const { t } = useTranslation()

  const [logger, { useNotifications }] = useServices([TOKENS.UTIL_LOGGER, TOKENS.NOTIFICATIONS, TOKENS.CONFIG])

  const notifications = useNotifications()
  const oobRecord = useOutOfBandById(oobRecordId)
  const connection = useConnectionByOutOfBandId(oobRecordId)

  const merge: MergeFunction = (current, next) => ({ ...current, ...next })
  const [state, dispatch] = useReducer(merge, {
    inProgress: true,
    isInitialized: false,
    notificationRecord: undefined,
  })

  const theme = useHekaTheme()
  const styles = useStyles(theme)

  const onDismissModalTouched = useCallback(() => {
    dispatch({ inProgress: false })
    navigation.getParent()?.navigate(TabStacks.HomeStack, { screen: Screens.Home })
  }, [dispatch, navigation])

  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => true)
    return () => backHandler.remove()
  }, [])

  useEffect(() => {
    if (!oobRecord || !state.inProgress) {
      return
    }

    // If we have a connection, but no goal code, we should navigate
    // to Chat
    if (connection && !(Object.values(GoalCodes) as [string]).includes(oobRecord?.outOfBandInvitation.goalCode ?? '')) {
      logger?.info('Connection: Handling connection without goal code, navigate to Chat')

      dispatch({ inProgress: false })
      navigation.getParent()?.dispatch(
        CommonActions.reset({
          index: 1,
          routes: [{ name: Stacks.TabStack }, { name: Screens.Chat, params: { connectionId: connection.id } }],
        })
      )

      return
    }

    // At this point we should be waiting for a notification
    // to be processed
    if (!state.notificationRecord) {
      return
    }

    // Connectionless proof request, we don't have connectionless offers.
    if (!connection) {
      dispatch({ inProgress: false })
      navigation.replace(Screens.ProofRequest, { proofId: state.notificationRecord.id })

      return
    }

    // At this point, we have connection based proof or offer with
    // a goal code.

    if (!oobRecord) {
      logger?.error(`Connection: No OOB record where one is expected`)

      return
    }

    const { goalCode } = oobRecord.outOfBandInvitation

    if (goalCode === GoalCodes.proofRequestVerify || goalCode === GoalCodes.proofRequestVerifyOnce) {
      logger?.info(`Connection: Handling ${goalCode} goal code, navigate to ProofRequest`)

      dispatch({ inProgress: false })
      navigation.replace(Screens.ProofRequest, { proofId: state.notificationRecord.id })

      return
    }

    if (goalCode === GoalCodes.credentialOffer) {
      logger?.info(`Connection: Handling ${goalCode} goal code, navigate to CredentialOffer`)

      dispatch({ inProgress: false })
      navigation.replace(Screens.CredentialOffer, { credentialId: state.notificationRecord.id })

      return
    }

    logger?.info(`Connection: Unable to handle ${goalCode} goal code`)

    dispatch({ inProgress: false })
    navigation.getParent()?.dispatch(
      CommonActions.reset({
        index: 1,
        routes: [{ name: Stacks.TabStack }, { name: Screens.Chat, params: { connectionId: connection.id } }],
      })
    )
  }, [connection, logger, navigation, oobRecord, state])

  useEffect(() => {
    if (!state.inProgress || state.notificationRecord) {
      return
    }
    type notCustomNotification = BasicMessageRecord | CredentialExchangeRecord | ProofExchangeRecord
    for (const notification of notifications) {
      // no action taken for BasicMessageRecords
      if ((notification as BasicMessageRecord).type === 'BasicMessageRecord') {
        logger?.info('Connection: BasicMessageRecord, skipping')
        continue
      }

      if (
        (connection && (notification as notCustomNotification).connectionId === connection.id) ||
        oobRecord
          ?.getTags()
          ?.invitationRequestsThreadIds?.includes((notification as notCustomNotification)?.threadId ?? '')
      ) {
        logger?.info(`Connection: Handling notification ${(notification as notCustomNotification).id}`)

        dispatch({ notificationRecord: notification })
        break
      }
    }
  }, [connection, logger, notifications, oobRecord, state])

  return (
    <SafeAreaView style={{ backgroundColor: ColorPallet.brand.modalPrimaryBackground }}>
      <SafeAreaView style={styles.pendingBackground}>
        <ScrollView style={styles.container}>
          <View style={styles.image}>
            <Loader />
          </View>
          <View style={styles.messageContainer}>
            <Text style={styles.messageText}>{t('Connection.MakingConnection')}</Text>
          </View>
        </ScrollView>
        <View style={styles.controlsContainer}>
          <Button
            title={t('Loading.GoBack')}
            accessibilityLabel={t('Loading.BackToHome')}
            onPress={onDismissModalTouched}
            buttonType={ButtonType.ModalSecondary}
          />
        </View>
      </SafeAreaView>
    </SafeAreaView>
  )
}

export default Connection
