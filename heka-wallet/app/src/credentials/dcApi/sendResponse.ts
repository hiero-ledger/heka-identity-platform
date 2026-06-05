import { sendResponse } from '@animo-id/expo-digital-credentials-api'

import { HekaWalletAgent } from '../../utils/agent'
import { acceptPresentationRequest } from '../openid4vc'
import { OpenIdPresentationSubmissionParams } from '../types'

import { DcApiResolvedRequest } from './resolveRequest'

/**
 * Builds and returns the OpenID4VP presentation response for a resolved Digital Credentials API request.
 */
export async function dcApiSendResponse(agent: HekaWalletAgent, resolved: DcApiResolvedRequest): Promise<void> {
  const { presentationRequest, inputDescriptorId, credentialId, protocol } = resolved

  const submissionParams: OpenIdPresentationSubmissionParams = {
    authorizationRequest: presentationRequest.authorizationRequest,
    credentialsForRequest: presentationRequest.credentialsForRequest,
    queryResult: presentationRequest.queryResult,
    origin: presentationRequest.origin,
    transactionData: presentationRequest.transactionData,
  }

  const result = await acceptPresentationRequest(agent, {
    submissionParams,
    selectedCredentials: { [inputDescriptorId]: credentialId },
  })

  sendResponse({
    response: JSON.stringify({
      protocol,
      data: result.authorizationResponse,
    }),
  })
}
