import { NotificationStackParams, Screens as BifoldScreens, TabStacks } from '@bifold/core'
import { useNavigation } from '@react-navigation/native'
import { StackNavigationProp, StackScreenProps } from '@react-navigation/stack'
import React, { useCallback } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'

import { PresentationRequestView } from '../components/views'
import LoadingView from '../components/views/LoadingView'
import { useAriesProofRequest } from '../hooks/useAriesProofRequest'

type Props = StackScreenProps<NotificationStackParams, BifoldScreens.ProofRequest>

export const AriesPresentationRequest: React.FC<Props> = ({ route }) => {
  if (!route?.params) {
    throw new Error('AriesPresentationRequest route prams were not set properly')
  }

  const { proofId } = route.params

  const navigation = useNavigation<StackNavigationProp<NotificationStackParams>>()

  const navigateToHome = useCallback(() => {
    navigation.getParent()?.navigate(TabStacks.HomeStack, { screen: BifoldScreens.Home })
  }, [navigation])

  const { presentationSubmission, isLoading, isShared, isDeclining, accept, decline, setSubmissionEntries } =
    useAriesProofRequest(proofId, { onDeclined: navigateToHome })

  if (isLoading || !presentationSubmission || isDeclining) {
    return <LoadingView />
  }

  return (
    <SafeAreaView style={{ flexGrow: 1 }} edges={['bottom', 'left', 'right']}>
      <PresentationRequestView
        presentationSubmission={presentationSubmission}
        onAccept={accept}
        onDecline={decline}
        setSubmissionEntries={setSubmissionEntries}
        isShared={isShared}
      />
    </SafeAreaView>
  )
}
