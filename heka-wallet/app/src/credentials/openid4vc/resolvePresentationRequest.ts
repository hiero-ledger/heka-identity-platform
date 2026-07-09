import { getHostNameFromUrl } from '@heka-wallet/shared'

import { HekaWalletAgent } from '../../utils/agent'
import { OpenId4VcPresentationRequest } from '../types'

export type ResolvePresentationRequestOptions = {
  /** A request URI (e.g. an `openid4vp://` deep link). */
  uri?: string
  /** A raw request string (already extracted from a deep link / QR). */
  data?: string
  /**
   * An already-parsed OpenID4VP authorization request payload.
   */
  requestPayload?: Record<string, unknown>
  /** The verifier web origin (required for the DC API / `dc_api` response mode binding). */
  origin?: string
}

/**
 * Resolves an OpenID4VP authorization request into the wallet's internal presentation-request shape.
 */
export async function resolvePresentationRequest(
  agent: HekaWalletAgent,
  { uri, data, requestPayload, origin }: ResolvePresentationRequestOptions
): Promise<OpenId4VcPresentationRequest> {
  if (!agent) {
    throw new Error('Credo agent is not initialized')
  }

  const requestToResolve = uri ?? data ?? requestPayload

  if (!requestToResolve) {
    throw new Error('Either supply a uri, data, or requestPayload to get the credentials for a proof request')
  }

  agent.config.logger.info('Receiving OID4VP request', {
    uri,
    hasData: !!data,
    hasRequestPayload: !!requestPayload,
    origin,
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
}
