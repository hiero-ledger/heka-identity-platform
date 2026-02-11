import {
  DidJwk,
  DidKey,
  DifPexCredentialsForRequest,
  getJwkFromKey,
  JwaSignatureAlgorithm,
  JwkDidCreateOptions,
  KeyDidCreateOptions,
  SdJwtVcRecord,
  W3cCredentialRecord,
} from '@credo-ts/core'
import {
  OpenId4VciCredentialFormatProfile,
  OpenId4VciRequestTokenResponse,
  OpenId4VciResolvedAuthorizationRequest,
  OpenId4VciResolvedAuthorizationRequestWithCode,
  OpenId4VciResolvedCredentialOffer,
  OpenId4VciTokenRequestOptions,
  OpenId4VcSiopVerifiedAuthorizationRequest,
} from '@credo-ts/openid4vc'
import { useAgent } from '@credo-ts/react-hooks'
import { getHostNameFromUrl } from '@heka-wallet/shared'
import { BifoldAgent } from '@hyperledger/aries-bifold-core'
import { PRE_AUTH_GRANT_LITERAL } from '@sphereon/oid4vci-common'
import { useCallback } from 'react'

import { extractOpenId4VcCredentialMetadata, setOpenId4VcCredentialMetadata } from './metadata'
import { OpenId4VcPresentationRequest } from './types'

export const useOpenIdHandlers = () => {
  const { agent, publicDid } = useAgent<BifoldAgent>()

  const resolveOpenId4VciOffer = useCallback(
    async ({
      offer,
      authorization,
    }: {
      offer: { data?: string; uri?: string }
      authorization?: { clientId: string; redirectUri: string }
    }) => {
      if (!agent) {
        throw new Error('Credo agent is not initialized')
      }

      let offerUri = offer.uri

      if (!offerUri && offer.data) {
        // FIXME: Credo only support credential offer string, but we already parsed it before. So we construct an offer here
        offerUri = `openid-credential-offer://credential_offer=${encodeURIComponent(JSON.stringify(offer.data))}`
      } else if (!offerUri) {
        throw new Error('Either data or uri must be provided')
      }

      agent.config.logger.info(`Receiving openid uri ${offerUri}`, {
        offerUri,
        data: offer.data,
        uri: offer.uri,
      })

      const resolvedCredentialOffer = await agent.modules.openId4VcHolder.resolveCredentialOffer(offerUri)
      let resolvedAuthorizationRequest: OpenId4VciResolvedAuthorizationRequest | undefined = undefined

      // NOTE: we always assume scopes are used at the moment
      if (resolvedCredentialOffer.credentialOfferPayload.grants?.authorization_code) {
        // If only authorization_code grant is valid and user didn't provide authorization details we can't continue
        if (!resolvedCredentialOffer.credentialOfferPayload.grants[PRE_AUTH_GRANT_LITERAL] && !authorization) {
          throw new Error(
            "Missing 'authorization' parameter with 'clientId' and 'redirectUri' and authorization code flow is only allowed grant type on offer."
          )
        }

        if (authorization) {
          const uniqueScopes = Array.from(
            new Set(
              resolvedCredentialOffer.offeredCredentials.map((o) => o.scope).filter((s): s is string => s !== undefined)
            )
          )

          resolvedAuthorizationRequest = await agent.modules.openId4VcHolder.resolveIssuanceAuthorizationRequest(
            resolvedCredentialOffer,
            {
              scope: uniqueScopes,
              redirectUri: authorization.redirectUri,
              clientId: authorization.clientId,
            }
          )
        }
      }

      return {
        resolvedCredentialOffer,
        resolvedAuthorizationRequest,
      }
    },
    [agent]
  )

  const acquireAccessToken = useCallback(
    async ({
      resolvedCredentialOffer,
      resolvedAuthorizationRequest,
      userPin,
    }: {
      resolvedCredentialOffer: OpenId4VciResolvedCredentialOffer
      resolvedAuthorizationRequest?: OpenId4VciResolvedAuthorizationRequestWithCode
      userPin?: string
    }) => {
      if (!agent) {
        throw new Error('Credo agent is not defined')
      }

      let tokenOptions: OpenId4VciTokenRequestOptions = {
        resolvedCredentialOffer,
        txCode: userPin,
      }

      if (resolvedAuthorizationRequest) {
        tokenOptions = { ...tokenOptions, resolvedAuthorizationRequest, code: resolvedAuthorizationRequest.code }
      }

      return await agent.modules.openId4VcHolder.requestToken(tokenOptions)
    },
    [agent]
  )

  const receiveCredentialFromOpenId4VciOffer = useCallback(
    async ({
      resolvedCredentialOffer,
      credentialConfigurationIdToRequest,
      accessToken,
      clientId,
    }: {
      resolvedCredentialOffer: OpenId4VciResolvedCredentialOffer
      credentialConfigurationIdToRequest?: string
      clientId?: string

      // TODO: cNonce could be provided separately (multiple calls can have different c_nonce values)
      accessToken: OpenId4VciRequestTokenResponse
    }) => {
      if (!agent || !publicDid) {
        throw new Error('Credo agent is not initialized')
      }

      // By default request the first offered credential
      // TODO: Use first supported credential from offered list
      const offeredCredentialToRequest = credentialConfigurationIdToRequest
        ? resolvedCredentialOffer.offeredCredentials.find(
            (offered) => offered.id === credentialConfigurationIdToRequest
          )
        : resolvedCredentialOffer.offeredCredentials[0]
      if (!offeredCredentialToRequest) {
        throw new Error(
          `Parameter 'credentialConfigurationIdToRequest' with value ${credentialConfigurationIdToRequest} is not a credential_configuration_id in the credential offer.`
        )
      }

      const allowedSignatureAlgorithms = [JwaSignatureAlgorithm.ES256]

      // FIXME: Return credential_supported entry for credential so it's easy to store metadata
      const credentials = await agent.modules.openId4VcHolder.requestCredentials({
        resolvedCredentialOffer,
        ...accessToken,
        clientId,
        credentialsToRequest: [offeredCredentialToRequest.id],
        verifyCredentialStatus: false,
        allowedProofOfPossessionSignatureAlgorithms: allowedSignatureAlgorithms,
        credentialBindingResolver: async ({
          supportedDidMethods,
          keyType,
          supportsAllDidMethods,
          supportsJwk,
          credentialFormat,
        }) => {
          // Prefer did:jwk, otherwise use did:key, otherwise use undefined
          let didMethod: 'key' | 'jwk' | undefined =
            supportsAllDidMethods || supportedDidMethods?.includes('did:jwk')
              ? 'jwk'
              : supportedDidMethods?.includes('did:key')
                ? 'key'
                : undefined

          // If supportedDidMethods is undefined, and supportsJwk is false, we will default to did:key
          if (!supportedDidMethods && !supportsJwk) {
            didMethod = 'key'
          }

          const key = await agent.wallet.createKey({
            keyType,
          })

          if (didMethod) {
            const didResult = await agent.dids.create<JwkDidCreateOptions | KeyDidCreateOptions>({
              method: didMethod,
              options: {
                key,
              },
            })

            if (didResult.didState.state !== 'finished') {
              throw new Error('DID creation failed.')
            }

            let verificationMethodId: string
            if (didMethod === 'jwk') {
              const didJwk = DidJwk.fromDid(didResult.didState.did)
              verificationMethodId = didJwk.verificationMethodId
            } else {
              const didKey = DidKey.fromDid(didResult.didState.did)
              verificationMethodId = `${didKey.did}#${didKey.key.fingerprint}`
            }

            return {
              didUrl: verificationMethodId,
              method: 'did',
            }
          }

          // Support plain jwk for sd-jwt only
          if (supportsJwk && credentialFormat === OpenId4VciCredentialFormatProfile.SdJwtVc) {
            return {
              method: 'jwk',
              jwk: getJwkFromKey(key),
            }
          }

          throw new Error(
            `No supported binding method could be found. Supported methods are did:key and did:jwk, or plain jwk for sd-jwt. Issuer supports ${
              supportsJwk ? 'jwk, ' : ''
            }${supportedDidMethods?.join(', ') ?? 'Unknown'}`
          )
        },
      })

      const [firstCredential] = credentials
      if (!firstCredential) throw new Error('Error retrieving credential.')

      let record: SdJwtVcRecord | W3cCredentialRecord

      // TODO: Add claimFormat to SdJwtVc
      if ('compact' in firstCredential.credential) {
        record = new SdJwtVcRecord({
          compactSdJwtVc: firstCredential.credential.compact,
        })
      } else {
        record = new W3cCredentialRecord({
          credential: firstCredential.credential,
          // FIXME: We don't support expanded types right now, it would become problem for JSON-LD support
          tags: {},
        })
      }

      const openId4VcMetadata = extractOpenId4VcCredentialMetadata(offeredCredentialToRequest, {
        id: resolvedCredentialOffer.metadata.issuer,
        display: resolvedCredentialOffer.metadata.credentialIssuerMetadata.display,
      })

      setOpenId4VcCredentialMetadata(record, openId4VcMetadata)

      return record
    },
    [agent, publicDid]
  )

  const resolveOpenId4VpPresentationRequest = useCallback(
    async (request: { data?: string; uri?: string }): Promise<OpenId4VcPresentationRequest> => {
      if (!agent) {
        throw new Error('Credo agent is not initialized')
      }

      let requestUri = request.uri

      if (!requestUri && request.data) {
        // FIXME: Credo only support request string, but we already parsed it before. So we construct an request here
        // but in the future we need to support the parsed request in Credo directly
        requestUri = `openid://request=${encodeURIComponent(request.data)}`
      } else if (!requestUri) {
        throw new Error('Either data or uri must be provided')
      }

      agent.config.logger.info(`Receiving openid uri ${requestUri}`, {
        requestUri,
        data: request.data,
        uri: request.uri,
      })

      const resolved = await agent.modules.openId4VcHolder.resolveSiopAuthorizationRequest(requestUri)

      if (!resolved.presentationExchange) {
        throw new Error('No presentation exchange found in authorization request.')
      }

      return {
        ...resolved.presentationExchange,
        authorizationRequest: resolved.authorizationRequest,
        verifierHostName: resolved.authorizationRequest.responseURI
          ? getHostNameFromUrl(resolved.authorizationRequest.responseURI)
          : undefined,
      }
    },
    [agent]
  )

  const acceptOpenId4VpPresentationRequest = useCallback(
    async ({
      authorizationRequest,
      credentialsForRequest,
      selectedCredentials,
    }: {
      authorizationRequest: OpenId4VcSiopVerifiedAuthorizationRequest
      credentialsForRequest: DifPexCredentialsForRequest
      selectedCredentials: { [inputDescriptorId: string]: string }
    }) => {
      if (!agent) {
        throw new Error('Credo agent is not initialized')
      }

      if (!credentialsForRequest.areRequirementsSatisfied) {
        throw new Error('Requirements from proof request are not satisfied')
      }

      const credentials = Object.fromEntries(
        credentialsForRequest.requirements.flatMap((requirement) =>
          requirement.submissionEntry.map((entry) => {
            const credentialId = selectedCredentials[entry.inputDescriptorId]

            // Use first available credential if not found in 'selectedCredentials'
            const credential =
              entry.verifiableCredentials.find((vc) => vc.credentialRecord.id === credentialId) ??
              entry.verifiableCredentials[0]

            return [entry.inputDescriptorId, [credential.credentialRecord]]
          })
        )
      )

      const result = await agent.modules.openId4VcHolder.acceptSiopAuthorizationRequest({
        authorizationRequest,
        presentationExchange: {
          credentials,
        },
      })

      if (result.serverResponse.status < 200 || result.serverResponse.status > 299) {
        throw new Error(`Error while accepting authorization request. ${result.serverResponse.body as string}`)
      }

      return result
    },
    [agent]
  )

  return {
    resolveOpenId4VciOffer,
    acquireAccessToken,
    receiveCredentialFromOpenId4VciOffer,
    resolveOpenId4VpPresentationRequest,
    acceptOpenId4VpPresentationRequest,
  }
}
