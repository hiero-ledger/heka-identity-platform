import { NotificationStackParams, Screens, Screens as BifoldScreens, TabStacks } from '@bifold/core'
import { useNavigation } from '@react-navigation/native'
import { StackNavigationProp, StackScreenProps } from '@react-navigation/stack'
import React, { useCallback } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'

import { CredentialOfferView } from '../components/views'
import LoadingView from '../components/views/LoadingView'
import { useAriesCredentialOffer } from '../hooks/useAriesCredentialOffer'

type Props = StackScreenProps<NotificationStackParams, BifoldScreens.CredentialOffer>

export const AriesCredentialOffer: React.FC<Props> = ({ route }) => {
  if (!route?.params) {
    throw new Error('AriesCredentialOffer route params were not set properly')
  }

  const { credentialId } = route.params

  const navigation = useNavigation<StackNavigationProp<NotificationStackParams>>()

  const navigateToHome = useCallback(() => {
    navigation.getParent()?.navigate(TabStacks.HomeStack, { screen: Screens.Home })
  }, [navigation])

  const { credential, isLoading, isAccepted, isDeclining, accept, decline } = useAriesCredentialOffer(credentialId, {
    onDeclined: navigateToHome,
  })

  if (isLoading || !credential || isDeclining) {
    return <LoadingView />
  }

  return (
    <SafeAreaView style={{ flexGrow: 1 }} edges={['bottom', 'left', 'right']}>
      <CredentialOfferView credential={credential} onAccept={accept} onDecline={decline} isAccepted={isAccepted} />
    </SafeAreaView>
  )
}
