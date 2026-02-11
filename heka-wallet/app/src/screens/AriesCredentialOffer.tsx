import { useAgent, useCredentialById } from '@credo-ts/react-hooks'
import { BifoldError, EventTypes } from '@hyperledger/aries-bifold-core'
import { useNetwork } from '@hyperledger/aries-bifold-core/App/contexts/network'
import {
  NotificationStackParams,
  Screens,
  Screens as BifoldScreens,
  TabStacks,
} from '@hyperledger/aries-bifold-core/App/types/navigators'
import { useNavigation } from '@react-navigation/native'
import { StackNavigationProp, StackScreenProps } from '@react-navigation/stack'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DeviceEventEmitter } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { CredentialOfferView } from '../components/views'
import LoadingView from '../components/views/LoadingView'
import { Credential, mapCredentialRecord } from '../credentials'

type Props = StackScreenProps<NotificationStackParams, BifoldScreens.CredentialOffer>

export const AriesCredentialOffer: React.FC<Props> = ({ route }) => {
  if (!route?.params) {
    throw new Error('AriesCredentialOffer route params were not set properly')
  }

  const { t } = useTranslation()

  const { credentialId } = route.params
  const credentialExchangeRecord = useCredentialById(credentialId)

  const { agent } = useAgent()

  const navigation = useNavigation<StackNavigationProp<NotificationStackParams>>()
  const { assertConnectedNetwork } = useNetwork()

  const [isCredentialLoading, setIsCredentialLoading] = useState(false)
  const [credential, setCredential] = useState<Credential | undefined>()

  const [isAccepted, setIsAccepted] = useState(false)
  const [isDeclining, setIsDeclining] = useState(false)

  useEffect(() => {
    if (credential || !credentialExchangeRecord || !agent) return

    setIsCredentialLoading(true)
    mapCredentialRecord(credentialExchangeRecord, agent)
      .then((credential) => setCredential(credential))
      .finally(() => setIsCredentialLoading(false))
  }, [agent, credentialExchangeRecord, credential])

  useEffect(() => {
    if (!agent) {
      DeviceEventEmitter.emit(
        EventTypes.ERROR_ADDED,
        new BifoldError(t('Error.Title1025'), t('Error.Message1025'), t('CredentialOffer.CredentialNotFound'), 1025)
      )
    }
  }, [t, agent])

  useEffect(() => {
    if (!credentialExchangeRecord) {
      DeviceEventEmitter.emit(
        EventTypes.ERROR_ADDED,
        new BifoldError(t('Error.Title1025'), t('Error.Message1025'), t('CredentialOffer.CredentialNotFound'), 1025)
      )
    }
  }, [t, credentialExchangeRecord])

  const onAccept = async () => {
    if (!agent || !credential || !assertConnectedNetwork()) return

    try {
      setIsAccepted(true)
      await agent.credentials.acceptOffer({ credentialRecordId: credential.id })
    } catch (err: unknown) {
      setIsAccepted(false)
      const error = new BifoldError(t('Error.Title1024'), t('Error.Message1024'), (err as Error)?.message ?? err, 1024)
      DeviceEventEmitter.emit(EventTypes.ERROR_ADDED, error)
    }
  }

  const onDecline = async () => {
    if (!agent || !credential) return

    try {
      setIsDeclining(true)
      await agent.credentials.declineOffer(credential.id, { sendProblemReport: true })
    } catch (err: unknown) {
      await agent.credentials.deleteById(credential.id)
    } finally {
      setIsDeclining(false)
      navigation.getParent()?.navigate(TabStacks.HomeStack, { screen: Screens.Home })
    }
  }

  if (isCredentialLoading || !credential || isDeclining) {
    return <LoadingView />
  }

  return (
    <SafeAreaView style={{ flexGrow: 1 }} edges={['bottom', 'left', 'right']}>
      <CredentialOfferView credential={credential} onAccept={onAccept} onDecline={onDecline} isAccepted={isAccepted} />
    </SafeAreaView>
  )
}
