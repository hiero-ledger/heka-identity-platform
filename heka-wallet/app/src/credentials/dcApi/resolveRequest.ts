import type { DigitalCredentialsRequest } from '@animo-id/expo-digital-credentials-api'

import { HekaWalletAgent } from '../../utils/agent'
import { resolvePresentationRequest } from '../openid4vc'
import { OpenId4VcPresentationRequest } from '../types'

export type DcApiResolvedRequest = {
  /** The resolved OpenID4VP presentation request. */
  presentationRequest: OpenId4VcPresentationRequest
  /**
   * The single DCQL credential-query id requested.
   */
  inputDescriptorId: string
  /** The wallet credential record id the user selected in the OS picker (echoed by the OS). */
  credentialId: string
  /**
   * The DC API protocol identifier the OS routed (e.g. `openid4vp-v1-signed` / `openid4vp`).
   * Echoed back in the `{ protocol, data }` response envelope the browser requires.
   */
  protocol: string
}

/**
 * Resolves a Digital Credentials API request into an OpenID4VP presentation request.
 */
export async function dcApiResolveRequest(
  agent: HekaWalletAgent,
  request: DigitalCredentialsRequest
): Promise<DcApiResolvedRequest> {
  // Extract the OpenID4VP request for the provider the OS selected, supporting both the v1.0
  // `requests[]` shape and the legacy `providers[]` shape.
  const providerRequest = request.request.requests
    ? request.request.requests[request.selectedEntry.providerIndex].data
    : request.request.providers[request.selectedEntry.providerIndex].request

  const protocol = request.request.requests
    ? request.request.requests[request.selectedEntry.providerIndex].protocol
    : request.request.providers[request.selectedEntry.providerIndex].protocol

  const requestPayload = typeof providerRequest === 'string' ? JSON.parse(providerRequest) : providerRequest

  const presentationRequest = await resolvePresentationRequest(agent, {
    requestPayload,
    origin: request.origin,
  })

  const inputDescriptorId = getSingleRequestedDescriptorId(presentationRequest)

  return {
    presentationRequest,
    inputDescriptorId,
    credentialId: request.selectedEntry.credentialId,
    protocol,
  }
}

/**
 * The Digital Credentials API delivers a single credential per request, so the resolved request
 * must reference exactly one PEX input descriptor or DCQL credential query. Returns its id.
 */
function getSingleRequestedDescriptorId(presentationRequest: OpenId4VcPresentationRequest): string {
  const { credentialsForRequest, queryResult } = presentationRequest

  if (credentialsForRequest) {
    const submissionEntries = credentialsForRequest.requirements.flatMap((requirement) => requirement.submissionEntry)
    if (submissionEntries.length !== 1) {
      throw new Error(
        `Digital Credentials API supports exactly one requested credential, but the request resolved to ${submissionEntries.length}.`
      )
    }
    return submissionEntries[0].inputDescriptorId
  }

  if (queryResult) {
    if (queryResult.credentials.length !== 1) {
      throw new Error(
        `Digital Credentials API supports exactly one requested credential, but the request resolved to ${queryResult.credentials.length}.`
      )
    }
    return queryResult.credentials[0].id
  }

  throw new Error('No presentation exchange or dcql found in the request.')
}
