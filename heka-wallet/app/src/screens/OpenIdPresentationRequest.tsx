import type { StackScreenProps } from '@react-navigation/stack'

import { useAgent } from '@credo-ts/react-hooks'
import {
  BifoldError,
  EventTypes,
  Screens as BifoldScreens,
  TabStacks as BifoldTabStacks,
} from '@hyperledger/aries-bifold-core'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DeviceEventEmitter } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { PresentationRequestView } from '../components/views'
import LoadingView from '../components/views/LoadingView'
import {
  mapOpenId4VcPresentationRequest,
  OpenIdPresentationSubmission,
  PresentationSubmissionEntry,
  useOpenIdHandlers,
} from '../credentials'
import { OpenIdStackParams, Screens } from '../navigators/types'

type Props = StackScreenProps<OpenIdStackParams, Screens.OpenIdPresentationRequest>

// Based on Bifold component: https://github.com/openwallet-foundation/bifold-wallet/blob/main/packages/legacy/core/App/screens/ProofRequest.tsx
export const OpenIdPresentationRequest: React.FC<Props> = ({ navigation, route }) => {
  if (!route?.params) {
    throw new Error('OpenIdPresentationRequest route prams were not set properly')
  }

  const { request } = route.params

  const { t } = useTranslation()

  const { agent } = useAgent()

  const { resolveOpenId4VpPresentationRequest, acceptOpenId4VpPresentationRequest } = useOpenIdHandlers()

  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isShared, setIsShared] = useState<boolean>(false)

  const [presentationSubmission, setPresentationSubmission] = useState<OpenIdPresentationSubmission>()

  const navigateToHome = useCallback(() => {
    navigation.getParent()?.navigate(BifoldTabStacks.HomeStack, { screen: BifoldScreens.Home })
  }, [navigation])

  const loadPresentationRequest = useCallback(async () => {
    if (!agent) return
    setIsLoading(true)
    try {
      const presentationRequest = await resolveOpenId4VpPresentationRequest(request)
      const mappedSubmission = await mapOpenId4VcPresentationRequest(presentationRequest, agent)

      setPresentationSubmission(mappedSubmission)
    } catch (error: unknown) {
      console.error(`Couldn't resolve OpenID4VP presentation request`, {
        error,
      })
      DeviceEventEmitter.emit(
        EventTypes.ERROR_ADDED,
        new BifoldError(t('Error.Title1027'), t('Error.Message1027'), (error as Error)?.message ?? error, 1027)
      )
      navigateToHome()
    } finally {
      setIsLoading(false)
    }
  }, [t, agent, resolveOpenId4VpPresentationRequest, request, navigateToHome])

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
        authorizationRequest: presentationSubmission.submissionParams.authorizationRequest,
        credentialsForRequest: presentationSubmission.submissionParams.credentialsForRequest,
        selectedCredentials: presentationSubmission.entries.reduce<Record<string, string>>((result, entry) => {
          result[entry.inputDescriptorId] = entry.selectedOption!.credential.id
          return result
        }, {}),
      })
    } catch (error: unknown) {
      setIsShared(false)
      console.error(`Couldn't accept OpenID4VP presentation request`, {
        error,
      })
      DeviceEventEmitter.emit(
        EventTypes.ERROR_ADDED,
        new BifoldError(t('Error.Title1027'), t('Error.Message1027'), (error as Error)?.message ?? error, 1027)
      )
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
