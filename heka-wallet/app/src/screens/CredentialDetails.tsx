import type { StackScreenProps } from '@react-navigation/stack'

import { Screens } from '@bifold/core'
import { useHekaTheme } from '@heka-wallet/shared'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { CredentialCard } from '../components/cards'
import { Record } from '../components/misc'
import CredentialContextMenu from '../components/misc/CredentialContextMenu'
import LoadingView from '../components/views/LoadingView'
import { Credential } from '../credentials'
import { useCredentialById } from '../hooks/useCredentialById'

type CredentialStackParams = {
  [Screens.CredentialDetails]: { credentialId: string | Credential }
}

type Props = StackScreenProps<CredentialStackParams, Screens.CredentialDetails>

// Based on Bifold component: https://github.com/openwallet-foundation/bifold-wallet/blob/main/packages/legacy/core/App/screens/CredentialDetails.tsx
export const CredentialDetails: React.FC<Props> = ({ navigation, route }) => {
  if (!route?.params) {
    throw new Error('CredentialDetails route prams were not set properly')
  }

  const { credentialId: routeCredential } = route.params

  const { t } = useTranslation()

  const theme = useHekaTheme()
  const { Spacing } = theme

  const { credential, isLoading: isCredentialLoading } = useCredentialById(routeCredential)

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

  // A loaded credential opens with every value hidden
  useEffect(() => {
    if (!credential) return

    setShown(credential.display.attributes.map(() => false))
    setShowAll(true)
  }, [credential])

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
