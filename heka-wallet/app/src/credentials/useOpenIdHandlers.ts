import {
  ClaimFormat,
  CredentialMultiInstanceUseMode,
  DcqlCredentialsForRequest,
  DcqlQueryResult,
  DidJwk,
  DidKey,
  JsonObject,
  JwkDidCreateOptions,
  KeyDidCreateOptions,
  Kms,
  MdocNameSpaces,
} from '@credo-ts/core'
import {
  OpenId4VcCredentialHolderBinding,
  OpenId4VciCredentialFormatProfile,
  OpenId4VciRequestTokenResponse,
  OpenId4VciResolvedAuthorizationRequest,
  OpenId4VciResolvedCredentialOffer,
  OpenId4VciTokenRequestOptions,
  getOfferedCredentials,
} from '@credo-ts/openid4vc'
import { getHostNameFromUrl } from '@heka-wallet/shared'
import { useCallback } from 'react'
import { Linking } from 'react-native'

import { useHekaAgent } from '../utils/agent'

import { extractOpenId4VcCredentialMetadata, setOpenId4VcCredentialMetadata } from './metadata'
import { CredentialRecord, OpenId4VcPresentationRequest, OpenIdPresentationSubmissionParams } from './types'

export const PRE_AUTH_GRANT_LITERAL = 'urn:ietf:params:oauth:grant-type:pre-authorized_code'

// Credential formats supported by the wallet
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

      const requestToResolve = request.uri ?? request.data

      if (!requestToResolve) {
        throw new Error('Either supply a uri or requestPayload to get the credentials for a proof request')
      }

      agent.config.logger.info(`Receiving OID4VP request ${requestToResolve}`, {
        requestToResolve,
        data: request.data,
        uri: request.uri,
      })

      const resolved = await agent.openid4vc.holder.resolveOpenId4VpAuthorizationRequest(requestToResolve, { origin })

      if (!resolved.presentationExchange && !resolved.dcql) {
        throw new Error('No presentation exchange or dcql found in authorization request.')
      }

      return {
        ...resolved.presentationExchange,
        ...resolved.dcql,
        authorizationRequest: resolved.authorizationRequestPayload,
        verifierHostName: resolved.authorizationRequestPayload.response_uri
          ? getHostNameFromUrl(resolved.authorizationRequestPayload.response_uri as string)
          : undefined,
        origin: resolved.origin,
        transactionData: resolved.transactionData,
      }
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

      if (
        !submissionParams.credentialsForRequest?.areRequirementsSatisfied &&
        !submissionParams.queryResult?.can_be_satisfied
      ) {
        throw new Error('Requirements from proof request are not satisfied')
      }

      // Map all requirements and entries to a credential record. If a credential record for an
      // input descriptor has been provided in `selectedCredentials` we will use that. Otherwise
      // it will pick the first available credential.
      const presentationExchangeCredentials = submissionParams.credentialsForRequest
        ? Object.fromEntries(
            await Promise.all(
              submissionParams.credentialsForRequest.requirements.flatMap((requirement) =>
                requirement.submissionEntry.slice(0, requirement.needsCount).map(async (entry) => {
                  const credentialId = selectedCredentials[entry.inputDescriptorId]
                  const credential =
                    entry.verifiableCredentials.find((vc) => vc.credentialRecord.id === credentialId) ??
                    entry.verifiableCredentials[0]

                  // NOTE: we don't support single-use credentials for PEX
                  return [entry.inputDescriptorId, [credential]]
                })
              )
            )
          )
        : undefined

      const dcqlCredentials = submissionParams.queryResult
        ? Object.fromEntries(
            await Promise.all(
              Object.entries(
                Object.keys(selectedCredentials).length > 0
                  ? // FIXME: this method should take into account w3c credentials
                    getSelectedCredentialsForDcqlRequest(submissionParams.queryResult, selectedCredentials)
                  : agent.openid4vc.holder.selectCredentialsForDcqlRequest(submissionParams.queryResult, {
                      // FIXME: we currently allow re-sharing if we don't have new instances anymore
                      // we should make this configurable maybe? Or dependant on credential type?
                      useMode: CredentialMultiInstanceUseMode.NewOrFirst,
                    })
              )
            )
          )
        : undefined

      const result = await agent.openid4vc.holder.acceptOpenId4VpAuthorizationRequest({
        authorizationRequestPayload: submissionParams.authorizationRequest,
        origin: submissionParams.origin,
        presentationExchange: presentationExchangeCredentials
          ? {
              credentials: presentationExchangeCredentials,
            }
          : undefined,
        dcql: dcqlCredentials
          ? {
              credentials: dcqlCredentials,
            }
          : undefined,
      })

      // If redirect_uri is provided, open it in the browser
      // Even if the response returned an error, the redirect URI must be opened
      if (result.redirectUri) {
        await Linking.openURL(result.redirectUri)
      }

      if (result.serverResponse && (result.serverResponse.status < 200 || result.serverResponse.status > 299)) {
        throw new Error(`Error while accepting authorization request. ${JSON.stringify(result.serverResponse?.body)}`)
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

function getSelectedCredentialsForDcqlRequest(
  dcqlQueryResult: DcqlQueryResult,
  selectedCredentials: { [credentialQueryId: string]: string }
): DcqlCredentialsForRequest {
  if (!dcqlQueryResult.can_be_satisfied) {
    throw new Error('Cannot select the credentials for the dcql query presentation if the request cannot be satisfied')
  }

  const credentials: DcqlCredentialsForRequest = {}

  type WithRecord<T> = T & {
    record: CredentialRecord
  }

  for (const [credentialQueryId, credentialRecordId] of Object.entries(selectedCredentials)) {
    const matchesForCredentialQuery = dcqlQueryResult.credential_matches[credentialQueryId]
    if (matchesForCredentialQuery.success) {
      const validCredentialMatch = matchesForCredentialQuery.valid_credentials.find(
        (credential) => (credential as WithRecord<typeof credential>).record.id === credentialRecordId
      )

      if (!validCredentialMatch) {
        throw new Error(
          `Could not find credential record ${credentialRecordId} in valid credential matches for credentialQueryId ${credentialQueryId}`
        )
      }

      // TODO: fix the typing, make selection in Credo easier
      const matchWithRecord = validCredentialMatch as typeof validCredentialMatch & {
        record: CredentialRecord
      }

      if (matchWithRecord.record.type === 'MdocRecord') {
        credentials[credentialQueryId] = [
          {
            claimFormat: ClaimFormat.MsoMdoc,
            credentialRecord: matchWithRecord.record,
            disclosedPayload: matchWithRecord.claims.valid_claim_sets[0].output as MdocNameSpaces,
            // FIXME: we currently allow re-sharing if we don't have new instances anymore
            // we should make this configurable maybe? Or dependant on credential type?
            useMode: CredentialMultiInstanceUseMode.NewOrFirst,
          },
        ]
      } else if (matchWithRecord.record.type === 'SdJwtVcRecord') {
        credentials[credentialQueryId] = [
          {
            claimFormat: ClaimFormat.SdJwtDc,
            credentialRecord: matchWithRecord.record,
            disclosedPayload: matchWithRecord.claims.valid_claim_sets[0].output as JsonObject,
            // FIXME: we currently allow re-sharing if we don't have new instances anymore
            // we should make this configurable maybe? Or dependant on credential type?
            useMode: CredentialMultiInstanceUseMode.NewOrFirst,
          },
        ]
      }
    }
  }

  return credentials
}
