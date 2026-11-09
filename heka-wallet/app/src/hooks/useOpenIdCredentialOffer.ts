import { BifoldError, EventTypes } from '@bifold/core'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DeviceEventEmitter } from 'react-native'

import {
  Credential,
  mapCredentialRecord,
  PRE_AUTH_GRANT_LITERAL,
  useCredentialRecordHelpers,
  useOpenIdHandlers,
} from '../credentials'
import { useHekaAgent } from '../utils/agent'

type OpenIdHandlers = ReturnType<typeof useOpenIdHandlers>
type OpenId4VciOffer = Parameters<OpenIdHandlers['resolveOpenId4VciOffer']>[0]['offer']

// OID4VCI offer: resolves it, asks for the user PIN when the grant needs one, then gets the
// token, receives and maps the credential; accept stores it. `onFailed` runs after a failure toast.
export const useOpenIdCredentialOffer = (offer: OpenId4VciOffer, { onFailed }: { onFailed: () => void }) => {
  const { t } = useTranslation()
  const { agent } = useHekaAgent()

  const { resolveOpenId4VciOffer, acquireAccessToken, receiveCredentialFromOpenId4VciOffer } = useOpenIdHandlers()
  const { storeCredentialRecord } = useCredentialRecordHelpers()

  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isCredentialPinInputVisible, setIsCredentialPinInputVisible] = useState(false)
  const [isAccepted, setIsAccepted] = useState(false)

  const [offerResolutionResult, setOfferResolutionResult] =
    useState<Awaited<ReturnType<OpenIdHandlers['resolveOpenId4VciOffer']>>>()
  const [credential, setCredential] = useState<Credential>()

  const requestCredential = useCallback(
    async (userPin?: string) => {
      if (!agent || !offerResolutionResult) return
      const { resolvedCredentialOffer } = offerResolutionResult

      try {
        const tokenOptions: Parameters<typeof acquireAccessToken>[0] = {
          resolvedCredentialOffer,
          userPin,
        }

        const tokenResponse = await acquireAccessToken(tokenOptions)
        const credentialRecord = await receiveCredentialFromOpenId4VciOffer({
          resolvedCredentialOffer,
          accessToken: tokenResponse,
        })
        const credential = await mapCredentialRecord(credentialRecord, agent)

        setCredential(credential)
      } catch (error: unknown) {
        console.error(`Couldn't receive credential from OpenID4VCI offer`, {
          error,
        })
        DeviceEventEmitter.emit(
          EventTypes.ERROR_ADDED,
          new BifoldError(
            t('Error.Title1035'),
            t('Error.Message1035'),
            (error as Error)?.message || t('Error.Unknown'),
            1035
          )
        )
        onFailed()
      }
    },
    [agent, offerResolutionResult, acquireAccessToken, receiveCredentialFromOpenId4VciOffer, t, onFailed]
  )

  useEffect(() => {
    if (!agent) return
    const resolveCredentialOffer = async () => {
      setIsLoading(true)
      try {
        const offerResolutionResult = await resolveOpenId4VciOffer({
          offer,
        })

        setOfferResolutionResult(offerResolutionResult)
      } catch (error: unknown) {
        console.error(`Couldn't resolve OpenID4VCI offer`, {
          error,
        })
        DeviceEventEmitter.emit(
          EventTypes.ERROR_ADDED,
          new BifoldError(
            t('Error.Title1035'),
            t('Error.Message1035'),
            (error as Error)?.message || t('Error.Unknown'),
            1035
          )
        )
        onFailed()
      }
    }
    resolveCredentialOffer()
  }, [agent, offer, resolveOpenId4VciOffer, t, onFailed])

  useEffect(() => {
    if (!offerResolutionResult) return
    const { resolvedCredentialOffer } = offerResolutionResult

    const resolvedGrants = resolvedCredentialOffer.credentialOfferPayload.grants
    // The library turns a draft 11 `user_pin_required` into `tx_code`, so `tx_code` is the only marker
    const isUserPinRequired = !!resolvedGrants?.[PRE_AUTH_GRANT_LITERAL]?.tx_code

    if (isUserPinRequired) {
      setIsCredentialPinInputVisible(true)
    } else {
      requestCredential().finally(() => setIsLoading(false))
    }
  }, [offerResolutionResult, requestCredential])

  const accept = useCallback(async () => {
    try {
      if (!credential) return

      setIsAccepted(true)

      await storeCredentialRecord(credential.record)

      // TODO: Send 'credential_accepted' notification to issuer
      // See https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html#name-notification-endpoint
    } catch (err: unknown) {
      setIsAccepted(false)
      const error = new BifoldError(t('Error.Title1024'), t('Error.Message1024'), (err as Error)?.message ?? err, 1024)
      DeviceEventEmitter.emit(EventTypes.ERROR_ADDED, error)
    }
  }, [credential, storeCredentialRecord, t])

  const confirmCredentialPin = useCallback(
    async (pin: string) => {
      await requestCredential(pin)
      setIsCredentialPinInputVisible(false)
      setIsLoading(false)
    },
    [requestCredential]
  )

  const cancelCredentialPin = useCallback(() => {
    setIsCredentialPinInputVisible(false)
  }, [])

  return {
    credential,
    isLoading,
    isAccepted,
    isCredentialPinInputVisible,
    accept,
    confirmCredentialPin,
    cancelCredentialPin,
  }
}
