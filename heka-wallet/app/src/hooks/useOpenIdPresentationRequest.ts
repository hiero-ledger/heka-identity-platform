import { BifoldError, EventTypes } from '@bifold/core'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DeviceEventEmitter } from 'react-native'

import {
  mapOpenId4VcPresentationRequest,
  OpenIdPresentationSubmission,
  PresentationSubmissionEntry,
  useOpenIdHandlers,
} from '../credentials'
import { useHekaAgent } from '../utils/agent'

type OpenId4VpRequest = Parameters<ReturnType<typeof useOpenIdHandlers>['resolveOpenId4VpPresentationRequest']>[0]

// OID4VP request: resolves and maps it, accepts with the selected credentials.
// `onFailed` runs after a resolve failure toast.
export const useOpenIdPresentationRequest = (request: OpenId4VpRequest, { onFailed }: { onFailed: () => void }) => {
  const { t } = useTranslation()
  const { agent } = useHekaAgent()

  const { resolveOpenId4VpPresentationRequest, acceptOpenId4VpPresentationRequest } = useOpenIdHandlers()

  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isShared, setIsShared] = useState<boolean>(false)

  const [presentationSubmission, setPresentationSubmission] = useState<OpenIdPresentationSubmission>()

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
      onFailed()
    } finally {
      setIsLoading(false)
    }
  }, [t, agent, resolveOpenId4VpPresentationRequest, request, onFailed])

  useEffect(() => {
    loadPresentationRequest()
  }, [loadPresentationRequest])

  const accept = useCallback(async () => {
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
      console.error(`Couldn't accept OpenID4VP presentation request`, {
        error,
      })
      DeviceEventEmitter.emit(
        EventTypes.ERROR_ADDED,
        new BifoldError(t('Error.Title1027'), t('Error.Message1027'), (error as Error)?.message ?? error, 1027)
      )
    }
  }, [presentationSubmission, acceptOpenId4VpPresentationRequest, t])

  const setSubmissionEntries = useCallback((entries: PresentationSubmissionEntry[]) => {
    setPresentationSubmission((submission) => ({ ...submission!, entries }))
  }, [])

  return { presentationSubmission, isLoading, isShared, accept, setSubmissionEntries }
}
