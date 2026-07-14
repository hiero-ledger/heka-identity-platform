import { DidJwk, DidKey, JwkDidCreateOptions, KeyDidCreateOptions, Kms } from '@credo-ts/core'
import {
  OpenId4VcCredentialHolderBinding,
  OpenId4VciCredentialFormatProfile,
  OpenId4VciRequestTokenResponse,
  OpenId4VciResolvedAuthorizationRequest,
  OpenId4VciResolvedCredentialOffer,
  OpenId4VciTokenRequestOptions,
  getOfferedCredentials,
} from '@credo-ts/openid4vc'
import { useCallback } from 'react'

import { useHekaAgent } from '../utils/agent'

import { extractOpenId4VcCredentialMetadata, setOpenId4VcCredentialMetadata } from './metadata'
import { resolvePresentationRequest, acceptPresentationRequest } from './openid4vc'
import { OpenId4VcPresentationRequest, OpenIdPresentationSubmissionParams } from './types'

export const PRE_AUTH_GRANT_LITERAL = 'urn:ietf:params:oauth:grant-type:pre-authorized_code'

const WALLET_SUPPORTED_CREDENTIAL_FORMATS: ReadonlyArray<string> = [
  OpenId4VciCredentialFormatProfile.SdJwtVc,
  OpenId4VciCredentialFormatProfile.JwtVcJson,
  OpenId4VciCredentialFormatProfile.JwtVcJsonLd,
  OpenId4VciCredentialFormatProfile.MsoMdoc,
]

const walletSupportsCredentialFormat = (format?: string) =>
  format !== undefined && WALLET_SUPPORTED_CREDENTIAL_FORMATS.includes(format)

const formatOfferedCredentialDescriptions = (
  offeredCredentials: OpenId4VciResolvedCredentialOffer['offeredCredentialConfigurations']
) =>
  Object.keys(offeredCredentials)
    .map((credentialId) => `${credentialId}: ${offeredCredentials[credentialId].format ?? '<missing format>'}`)
    .join(', ')

export const useOpenIdHandlers = () => {
  const { agent, publicDid } = useHekaAgent()

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

      const resolvedCredentialOffer = await agent.openid4vc.holder.resolveCredentialOffer(offerUri)
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
          resolvedAuthorizationRequest = await agent.openid4vc.holder.resolveOpenId4VciAuthorizationRequest(
            resolvedCredentialOffer,
            {
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
      resolvedAuthorizationRequest?: OpenId4VciResolvedAuthorizationRequest
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
        tokenOptions = {
          ...tokenOptions,
          dpop: resolvedAuthorizationRequest.dpop
            ? {
                alg: resolvedAuthorizationRequest.dpop.jwk.supportedSignatureAlgorithms[0],
                jwk: resolvedAuthorizationRequest.dpop.jwk,
              }
            : undefined,
          // @ts-expect-error - TODO: Fix typecheck here
          codeVerifier:
            'codeVerifier' in resolvedAuthorizationRequest ? resolvedAuthorizationRequest.codeVerifier : undefined,
        }
      }

      return await agent.openid4vc.holder.requestToken(tokenOptions)
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

      // TODO: Support batch issuance
      const credentialIdsToRequest = credentialConfigurationIdToRequest
        ? [credentialConfigurationIdToRequest]
        : [resolvedCredentialOffer.credentialOfferPayload.credential_configuration_ids[0]]

      const offeredCredentialsToRequest = getOfferedCredentials(
        credentialIdsToRequest,
        resolvedCredentialOffer.offeredCredentialConfigurations
      )

      if (!offeredCredentialsToRequest) {
        const offeredCredentialDescriptions = formatOfferedCredentialDescriptions(
          resolvedCredentialOffer.offeredCredentialConfigurations
        )
        const errorMessage = credentialConfigurationIdToRequest
          ? `Parameter 'credentialConfigurationIdToRequest' with value ${credentialConfigurationIdToRequest} is not a credential_configuration_id in the credential offer.`
          : `No supported credential format found in the credential offer. Supported formats: ${WALLET_SUPPORTED_CREDENTIAL_FORMATS.join(', ')}. Offered credentials: ${offeredCredentialDescriptions}`
        throw new Error(errorMessage)
      }

      if (
        credentialConfigurationIdToRequest &&
        !walletSupportsCredentialFormat(offeredCredentialsToRequest[credentialConfigurationIdToRequest].format)
      ) {
        const offeredCredentialDescriptions = formatOfferedCredentialDescriptions(
          resolvedCredentialOffer.offeredCredentialConfigurations
        )
        throw new Error(
          `Credential configuration '${credentialConfigurationIdToRequest}' uses unsupported format '${offeredCredentialsToRequest[credentialConfigurationIdToRequest].format}'. Supported formats: ${WALLET_SUPPORTED_CREDENTIAL_FORMATS.join(', ')}. Offered credentials: ${offeredCredentialDescriptions}`
        )
      }

      const { credentials } = await agent.openid4vc.holder.requestCredentials({
        resolvedCredentialOffer,
        ...accessToken,
        clientId,
        credentialConfigurationIds: Object.keys(offeredCredentialsToRequest),
        verifyCredentialStatus: false,
        allowedProofOfPossessionSignatureAlgorithms: [
          Kms.KnownJwaSignatureAlgorithms.EdDSA,
          Kms.KnownJwaSignatureAlgorithms.ES256,
        ],
        credentialBindingResolver: async ({
          supportedDidMethods,
          proofTypes,
          supportsAllDidMethods,
          supportsJwk,
          credentialFormat,
        }): Promise<OpenId4VcCredentialHolderBinding> => {
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

          // TODO: support key attestations
          if (!proofTypes.jwt || proofTypes.jwt.keyAttestationsRequired) {
            throw new Error('Unable to request credentials. Only jwt proof type without key attestations supported')
          }

          const signatureAlgorithm = proofTypes.jwt.supportedSignatureAlgorithms[0]

          const key = await agent.kms
            .createKeyForSignatureAlgorithm({
              algorithm: signatureAlgorithm,
            })
            .then((key) => Kms.PublicJwk.fromUnknown(key.publicJwk))

          if (didMethod) {
            const didResult = await agent.dids.create<JwkDidCreateOptions | KeyDidCreateOptions>({
              method: didMethod,
              options: {
                keyId: key.keyId,
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
              verificationMethodId = `${didKey.did}#${didKey.publicJwk.fingerprint}`
            }

            return {
              didUrls: [verificationMethodId],
              method: 'did',
            }
          }

          // Support plain jwk for sd-jwt and mdoc
          if (
            supportsJwk &&
            (credentialFormat === OpenId4VciCredentialFormatProfile.SdJwtVc ||
              credentialFormat === OpenId4VciCredentialFormatProfile.SdJwtDc ||
              credentialFormat === OpenId4VciCredentialFormatProfile.MsoMdoc)
          ) {
            return {
              method: 'jwk',
              keys: [key],
            }
          }

          throw new Error(
            `No supported binding method could be found. Supported methods are did:key and did:jwk, or plain jwk for sd-jwt/mdoc. Issuer supports ${
              supportsJwk ? 'jwk, ' : ''
            }${supportedDidMethods?.join(', ') ?? 'Unknown'}`
          )
        },
      })

      const [firstCredential] = credentials
      if (!firstCredential) throw new Error('Error retrieving credential.')

      const { record, credentialConfiguration } = firstCredential

      const openId4VcMetadata = extractOpenId4VcCredentialMetadata(credentialConfiguration, {
        id: resolvedCredentialOffer.metadata.credentialIssuer.credential_issuer,
        display: resolvedCredentialOffer.metadata.credentialIssuer.display,
      })

      agent.config.logger.info('Resolved openid issuer metadata', {
        display: resolvedCredentialOffer.metadata.credentialIssuer.display,
        issuerId: openId4VcMetadata.issuer.id,
      })

      setOpenId4VcCredentialMetadata(record, openId4VcMetadata)

      return record
    },
    [agent, publicDid]
  )

  const resolveOpenId4VpPresentationRequest = useCallback(
    async (request: { data?: string; uri?: string }, origin?: string): Promise<OpenId4VcPresentationRequest> => {
      if (!agent) {
        throw new Error('Credo agent is not initialized')
      }

      return resolvePresentationRequest(agent, { uri: request.uri, data: request.data, origin })
    },
    [agent]
  )

  const acceptOpenId4VpPresentationRequest = useCallback(
    async ({
      submissionParams,
      selectedCredentials,
    }: {
      submissionParams: OpenIdPresentationSubmissionParams
      selectedCredentials: { [inputDescriptorId: string]: string }
    }) => {
      if (!agent) {
        throw new Error('Credo agent is not initialized')
      }

      return acceptPresentationRequest(agent, { submissionParams, selectedCredentials })
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
