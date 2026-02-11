import type { StackScreenProps } from '@react-navigation/stack'

import { CredentialExchangeRecord } from '@credo-ts/core'
import { useAgent } from '@credo-ts/react-hooks'
import { useHekaTheme } from '@heka-wallet/shared'
import { BifoldError, EventTypes, Screens } from '@hyperledger/aries-bifold-core'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DeviceEventEmitter, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { CredentialCard } from '../components/cards'
import { Record } from '../components/misc'
import CredentialContextMenu from '../components/misc/CredentialContextMenu'
import LoadingView from '../components/views/LoadingView'
import { mapCredentialRecord, Credential } from '../credentials'

type CredentialStackParams = {
  [Screens.CredentialDetails]: { credential: CredentialExchangeRecord | Credential }
}

type Props = StackScreenProps<CredentialStackParams, Screens.CredentialDetails>

// Based on Bifold component: https://github.com/openwallet-foundation/bifold-wallet/blob/main/packages/legacy/core/App/screens/CredentialDetails.tsx
export const CredentialDetails: React.FC<Props> = ({ navigation, route }) => {
  if (!route?.params) {
    throw new Error('CredentialDetails route prams were not set properly')
  }

  const { credential: routeCredential } = route.params
  const routeWithCredentialRecord = routeCredential instanceof CredentialExchangeRecord

  const { t } = useTranslation()

  const theme = useHekaTheme()
  const { Spacing } = theme

  const { agent } = useAgent()

  const [isCredentialLoading, setIsCredentialLoading] = useState(false)
  const [credential, setCredential] = useState<Credential | undefined>(
    !routeWithCredentialRecord ? routeCredential : undefined
  )

  const [shown, setShown] = useState<boolean[]>([])
  const [showAll, setShowAll] = useState<boolean>(false)

  useEffect(() => {
    if (!credential) return

    navigation.setOptions({
      headerRight: () => (
        <View>
          <CredentialContextMenu credential={credential} />
        </View>
      ),
    })
  }, [credential, navigation])

  const resetShown = (): void => {
    setShown(credential!.display.attributes.map(() => showAll))
    setShowAll(!showAll)
  }

  const toggleShownState = (newShowStates: boolean[]): void => {
    if (
      newShowStates.filter((shownState) => shownState === showAll).length >
      Math.floor(credential!.display.attributes.length / 2)
    ) {
      setShowAll(!showAll)
    }
    setShown(newShowStates)
  }

  // TODO: Rework current resetShown function to fix eslint error
  useEffect(() => {
    if (credential) {
      resetShown()
    }
  }, [credential]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (credential || !routeWithCredentialRecord || !agent) return

    setIsCredentialLoading(true)
    mapCredentialRecord(routeCredential, agent)
      .then((credential) => setCredential(credential))
      .finally(() => setIsCredentialLoading(false))
  }, [agent, routeCredential, credential, routeWithCredentialRecord])

  useEffect(() => {
    if (!agent) {
      DeviceEventEmitter.emit(
        EventTypes.ERROR_ADDED,
        new BifoldError(t('Error.Title1033'), t('Error.Message1033'), t('CredentialDetails.CredentialNotFound'), 1033)
      )
    }
  }, [t, agent])

  useEffect(() => {
    if (!routeCredential) {
      DeviceEventEmitter.emit(
        EventTypes.ERROR_ADDED,
        new BifoldError(t('Error.Title1033'), t('Error.Message1033'), t('CredentialDetails.CredentialNotFound'), 1033)
      )
    }
  }, [t, routeCredential])

  if (isCredentialLoading || !credential) {
    return <LoadingView />
  }

  return (
    <SafeAreaView style={{ flexGrow: 1, paddingHorizontal: Spacing.xl }} edges={['left', 'right']}>
      <Record
        fields={credential.display.attributes || []}
        hideFieldValues
        header={() => (
          <CredentialCard
            credentialDisplay={credential.display}
            showActionButton
            actionButtonTitle={showAll ? t('CredentialDetails.ShowAll') : t('CredentialDetails.HideAll')}
            onActionButtonPress={resetShown}
          />
        )}
        shown={shown}
        toggleShownState={toggleShownState}
      />
    </SafeAreaView>
  )
}
