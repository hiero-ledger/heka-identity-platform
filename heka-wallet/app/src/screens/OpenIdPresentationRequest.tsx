import type { StackScreenProps } from '@react-navigation/stack'

import { BifoldError, EventTypes, Screens as BifoldScreens, TabStacks as BifoldTabStacks } from '@bifold/core'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DeviceEventEmitter } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { PresentationRequestView } from '../components/views'
import LoadingView from '../components/views/LoadingView'
import {
  describePresentationError,
  getPresentationErrorContent,
  mapOpenId4VcPresentationRequest,
  OpenIdPresentationSubmission,
  PresentationSubmissionEntry,
  useOpenIdHandlers,
} from '../credentials'
import { OpenIdStackParams, Screens } from '../navigators/types'
import { useHekaAgent } from '../utils/agent'

type Props = StackScreenProps<OpenIdStackParams, Screens.OpenIdPresentationRequest>

// Based on Bifold component: https://github.com/openwallet-foundation/bifold-wallet/blob/main/packages/legacy/core/App/screens/ProofRequest.tsx
export const OpenIdPresentationRequest: React.FC<Props> = ({ navigation, route }) => {
  if (!route?.params) {
    throw new Error('OpenIdPresentationRequest route prams were not set properly')
  }

  const { request } = route.params

  const { t } = useTranslation()

  const { agent } = useHekaAgent()

  const { resolveOpenId4VpPresentationRequest, acceptOpenId4VpPresentationRequest } = useOpenIdHandlers()

  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isShared, setIsShared] = useState<boolean>(false)

  const [presentationSubmission, setPresentationSubmission] = useState<OpenIdPresentationSubmission>()

  const navigateToHome = useCallback(() => {
    navigation.getParent()?.navigate(BifoldTabStacks.HomeStack, { screen: BifoldScreens.Home })
  }, [navigation])

  // Error 1027 ("Unable to accept proof request"). The modal shows the title and the message, so both come
  // from getPresentationErrorContent, which never passes raw verifier responses through.
  const reportPresentationError = useCallback(
    (error: unknown) => {
      const { title, message } = getPresentationErrorContent(error, t)
      DeviceEventEmitter.emit(EventTypes.ERROR_ADDED, new BifoldError(title, t('Error.Message1027'), message, 1027))
    },
    [t]
  )

  const loadPresentationRequest = useCallback(async () => {
    if (!agent) return
    setIsLoading(true)
    try {
      const presentationRequest = await resolveOpenId4VpPresentationRequest(request)
      const mappedSubmission = await mapOpenId4VcPresentationRequest(presentationRequest, agent)

      setPresentationSubmission(mappedSubmission)
    } catch (error: unknown) {
      console.error(`Couldn't resolve OpenID4VP presentation request`, describePresentationError(error))
      reportPresentationError(error)
      navigateToHome()
    } finally {
      setIsLoading(false)
    }
  }, [agent, resolveOpenId4VpPresentationRequest, request, reportPresentationError, navigateToHome])

  useEffect(() => {
    loadPresentationRequest()
  }, [loadPresentationRequest])

  const onAccept = async () => {
    try {
      setIsShared(true)

      if (!presentationSubmission) {
        throw new Error(t('ProofRequest.RequestedCredentialsCouldNotBeFound'))
      }

      await acceptOpenId4VpPresentationRequest({
        submissionParams: presentationSubmission.submissionParams,
        selectedCredentials: presentationSubmission.entries.reduce<Record<string, string>>((result, entry) => {
          result[entry.inputDescriptorId] = entry.selectedOption!.credential.id
          return result
        }, {}),
      })
    } catch (error: unknown) {
      setIsShared(false)
      console.error(`Couldn't accept OpenID4VP presentation request`, describePresentationError(error))
      reportPresentationError(error)
    }
  }

  const onDecline = async () => {
    navigateToHome()
  }

  const setSubmissionEntries = useCallback((entries: PresentationSubmissionEntry[]) => {
    setPresentationSubmission((submission) => ({ ...submission!, entries }))
  }, [])

  if (isLoading || !presentationSubmission) {
    return <LoadingView />
  }

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['bottom', 'left', 'right']}>
      <PresentationRequestView
        presentationSubmission={presentationSubmission}
        setSubmissionEntries={setSubmissionEntries}
        onAccept={onAccept}
        onDecline={onDecline}
        isShared={isShared}
      />
    </SafeAreaView>
  )
}
