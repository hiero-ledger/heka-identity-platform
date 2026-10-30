import type { DcqlCredentialsForRequest } from '@credo-ts/core'
import type { OpenId4VcHolderApi } from '@credo-ts/openid4vc'

import { getOrCreateAgent } from '../credo/lazy-agent'

export type ResolvedPresentationRequest = Awaited<ReturnType<OpenId4VcHolderApi['resolveOpenId4VpAuthorizationRequest']>>

export async function handlePresentationRequest(requestUri: string): Promise<{
  resolved: ResolvedPresentationRequest
  selectedCredentials: DcqlCredentialsForRequest
}> {
  const agent = await getOrCreateAgent()
  const holder = agent.openid4vc.holder
  const resolved = await holder.resolveOpenId4VpAuthorizationRequest(requestUri)

  if (!resolved.dcql) {
    throw new Error('Only DCQL-based presentation requests are supported')
  }

  const selectedCredentials = holder.selectCredentialsForDcqlRequest(resolved.dcql.queryResult)
  return { resolved, selectedCredentials }
}

export async function submitPresentation(
  resolved: Pick<ResolvedPresentationRequest, 'authorizationRequestPayload' | 'origin'>,
  dcqlCredentials: DcqlCredentialsForRequest,
) {
  const agent = await getOrCreateAgent()
  return agent.openid4vc.holder.acceptOpenId4VpAuthorizationRequest({
    authorizationRequestPayload: resolved.authorizationRequestPayload,
    dcql: { credentials: dcqlCredentials },
    origin: resolved.origin,
  })
}
