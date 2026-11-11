import type { StackScreenProps } from '@react-navigation/stack'

import { Screens as BifoldScreens, TabStacks as BifoldTabStacks } from '@bifold/core'
import React, { useCallback } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'

import { PresentationRequestView } from '../components/views'
import LoadingView from '../components/views/LoadingView'
import { useOpenIdPresentationRequest } from '../hooks/useOpenIdPresentationRequest'
import { OpenIdStackParams, Screens } from '../navigators/types'

type Props = StackScreenProps<OpenIdStackParams, Screens.OpenIdPresentationRequest>

// Based on Bifold component: https://github.com/openwallet-foundation/bifold-wallet/blob/main/packages/legacy/core/App/screens/ProofRequest.tsx
export const OpenIdPresentationRequest: React.FC<Props> = ({ navigation, route }) => {
  if (!route?.params) {
    throw new Error('OpenIdPresentationRequest route prams were not set properly')
  }

  const { request } = route.params

  const navigateToHome = useCallback(() => {
    navigation.getParent()?.navigate(BifoldTabStacks.HomeStack, { screen: BifoldScreens.Home })
  }, [navigation])

  const { presentationSubmission, isLoading, isShared, accept, setSubmissionEntries } = useOpenIdPresentationRequest(
    request,
    { onFailed: navigateToHome }
  )

  const onDecline = async () => {
    navigateToHome()
  }

  if (isLoading || !presentationSubmission) {
    return <LoadingView />
  }

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['bottom', 'left', 'right']}>
      <PresentationRequestView
        presentationSubmission={presentationSubmission}
        setSubmissionEntries={setSubmissionEntries}
        onAccept={accept}
        onDecline={onDecline}
        isShared={isShared}
      />
    </SafeAreaView>
  )
}
