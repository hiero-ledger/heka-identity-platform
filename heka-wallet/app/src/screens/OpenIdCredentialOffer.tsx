import { useAgent } from '@credo-ts/react-hooks'
import { ConfirmationInputModal, ConfirmationInputType } from '@heka-wallet/shared'
import {
  BifoldError,
  EventTypes,
  Screens as BifoldScreens,
  TabStacks as BifoldTabStacks,
} from '@hyperledger/aries-bifold-core'
import { StackScreenProps } from '@react-navigation/stack'
import { PRE_AUTH_GRANT_LITERAL } from '@sphereon/oid4vci-common'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DeviceEventEmitter } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { CredentialOfferView } from '../components/views'
import LoadingView from '../components/views/LoadingView'
import { Credential, mapCredentialRecord, useCredentialRecordHelpers, useOpenIdHandlers } from '../credentials'
import { OpenIdStackParams, Screens } from '../navigators/types'

type CredentialOfferProps = StackScreenProps<OpenIdStackParams, Screens.OpenIdCredentialOffer>
type OfferStatus = 'resolving' | 'awaitingPin' | 'fetching' | 'presenting' | 'error'

// Based on Bifold component: https://github.com/openwallet-foundation/bifold-wallet/blob/main/packages/legacy/core/App/screens/CredentialOffer.tsx
export const OpenIdCredentialOffer: React.FC<CredentialOfferProps> = ({ navigation, route }) => {
  if (!route?.params) {
    throw new Error('OpenIdCredentialOffer route params were not set properly')
  }

  const { t } = useTranslation()

  const { offer } = route.params
  const { agent, publicDid } = useAgent()

  const { resolveOpenId4VciOffer, acquireAccessToken, receiveCredentialFromOpenId4VciOffer } = useOpenIdHandlers()
  const { storeCredentialRecord } = useCredentialRecordHelpers()

  const [status, setStatus] = useState<OfferStatus>('resolving')
  const [isAccepted, setIsAccepted] = useState(false)

  const [offerResolutionResult, setOfferResolutionResult] =
    useState<Awaited<ReturnType<typeof resolveOpenId4VciOffer>>>()
  const [credential, setCredential] = useState<Credential>()

  const navigateToHome = useCallback(() => {
    navigation.getParent()?.navigate(BifoldTabStacks.HomeStack, { screen: BifoldScreens.Home })
  }, [navigation])

  const requestCredential = useCallback(
    async (userPin?: string): Promise<boolean> => {
      if (!agent || !publicDid || !offerResolutionResult) return false
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
        return true
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
        return false
      }
    },
    [
      agent,
      publicDid,
      offerResolutionResult,
      acquireAccessToken,
      receiveCredentialFromOpenId4VciOffer,
      t,
    ]
  )

  useEffect(() => {
    if (!publicDid) return
    const resolveCredentialOffer = async () => {
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
        navigateToHome()
      }
    }
    resolveCredentialOffer()
  }, [publicDid, offer, resolveOpenId4VciOffer, t, navigateToHome])

  useEffect(() => {
    if (!offerResolutionResult) return
    const { resolvedCredentialOffer } = offerResolutionResult

    const resolvedGrants = resolvedCredentialOffer.credentialOfferPayload.grants
    const isUserPinRequired = resolvedGrants && resolvedGrants[PRE_AUTH_GRANT_LITERAL]?.user_pin_required

    if (isUserPinRequired) {
      setStatus('awaitingPin')
    } else {
      setStatus('fetching')
      requestCredential().then((success) => {
        if (success) {
          setStatus('presenting')
        } else {
          navigateToHome()
        }
      })
    }
  }, [offerResolutionResult, requestCredential, navigateToHome])

  const onAccept = async () => {
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
  }

  const onDecline = async () => {
    // TODO: Send 'credential_deleted' notification to issuer
    // See https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html#name-notification-endpoint
    navigateToHome()
  }

  const onCredentialPinConfirm = async (pin: string) => {
    setStatus('fetching')
    const success = await requestCredential(pin)
    if (success) {
      setStatus('presenting')
    } else {
      setStatus('error')
    }
  }

  const onCredentialPinCancel = () => {
    navigateToHome()
  }

  if (status === 'resolving' || status === 'fetching') {
    return <LoadingView />
  }

  if (status === 'awaitingPin' || status === 'error') {
    return (
      <ConfirmationInputModal
        title={t('CredentialOffer.EnterCredentialPIN')}
        inputType={ConfirmationInputType.Password}
        inputLabel={t('Common.Code')}
        isVisible={true}
        doneButtonTitle={t('Global.Confirm')}
        onConfirm={onCredentialPinConfirm}
        onCancel={onCredentialPinCancel}
      />
    )
  }

  return (
    <SafeAreaView style={{ flexGrow: 1 }} edges={['bottom', 'left', 'right']}>
      <CredentialOfferView
        credential={credential!}
        onAccept={onAccept}
        onDecline={onDecline}
        isAccepted={isAccepted}
        isUseBackAsDecline={true}
      />
    </SafeAreaView>
  )
}
