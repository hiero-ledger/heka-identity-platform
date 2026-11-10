import { Linking } from 'react-native'

import { acceptPresentationRequest } from '../../../src/credentials/openid4vc/acceptPresentationRequest'
import { PresentationRejectedError } from '../../../src/credentials/openid4vc/presentationErrors'
import { OpenIdPresentationSubmissionParams } from '../../../src/credentials/types'
import { HekaWalletAgent } from '../../../src/utils/agent'

jest.mock('../../../src/utils/agent', () => ({}))

const verificationFailureResponse = {
  status: 400,
  body: { error: 'invalid_request', error_description: 'One or more presentations failed verification.' },
}

function sdJwtVcRecord(id: string, { withStatus = true } = {}) {
  return {
    id,
    type: 'SdJwtVcRecord',
    firstCredential: {
      compact: `${id}-compact~disclosure~`,
      payload: {
        vct: 'urn:example:employee',
        ...(withStatus ? { status: { status_list: { uri: 'https://issuer.example/status/1', idx: 7 } } } : {}),
      },
    },
  }
}

function pexSubmissionParams(records: object[]): OpenIdPresentationSubmissionParams {
  return {
    authorizationRequest: {},
    credentialsForRequest: {
      areRequirementsSatisfied: true,
      requirements: [
        {
          needsCount: records.length,
          submissionEntry: records.map((record, index) => ({
            inputDescriptorId: `descriptor-${index}`,
            verifiableCredentials: [{ claimFormat: 'dc+sd-jwt', credentialRecord: record }],
          })),
        },
      ],
    },
  } as unknown as OpenIdPresentationSubmissionParams
}

function dcqlSubmissionParams(record: object): OpenIdPresentationSubmissionParams {
  return {
    authorizationRequest: {},
    queryResult: {
      can_be_satisfied: true,
      credential_matches: {
        employee: {
          success: true,
          valid_credentials: [{ record, claims: { valid_claim_sets: [{ output: { name: 'Alice' } }] } }],
        },
      },
    },
  } as unknown as OpenIdPresentationSubmissionParams
}

function createAgent() {
  return {
    openid4vc: {
      holder: { acceptOpenId4VpAuthorizationRequest: jest.fn(), selectCredentialsForDcqlRequest: jest.fn() },
    },
  }
}

async function captureRejection(promise: Promise<unknown>): Promise<PresentationRejectedError> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e
  )
  expect(error).toBeInstanceOf(PresentationRejectedError)
  return error as PresentationRejectedError
}

describe('acceptPresentationRequest', () => {
  let agent: ReturnType<typeof createAgent>

  beforeEach(() => {
    agent = createAgent()
  })

  it('returns the result when the verifier accepts the presentation', async () => {
    const result = { ok: true, serverResponse: { status: 200, body: {} } }
    agent.openid4vc.holder.acceptOpenId4VpAuthorizationRequest.mockResolvedValue(result)

    await expect(
      acceptPresentationRequest(agent as unknown as HekaWalletAgent, {
        submissionParams: pexSubmissionParams([sdJwtVcRecord('record-1')]),
        selectedCredentials: { 'descriptor-0': 'record-1' },
      })
    ).resolves.toBe(result)
  })

  it('throws a rejection error without the raw response when the verifier rejects the presentation', async () => {
    agent.openid4vc.holder.acceptOpenId4VpAuthorizationRequest.mockResolvedValue({
      ok: false,
      serverResponse: verificationFailureResponse,
    })

    const error = await captureRejection(
      acceptPresentationRequest(agent as unknown as HekaWalletAgent, {
        submissionParams: pexSubmissionParams([sdJwtVcRecord('record-1')]),
        selectedCredentials: { 'descriptor-0': 'record-1' },
      })
    )

    expect(error.status).toBe(400)
    expect(error.isVerificationFailure).toBe(true)
    expect(error.message).not.toContain('{')
  })

  it('still opens the redirect URI of a rejected presentation', async () => {
    agent.openid4vc.holder.acceptOpenId4VpAuthorizationRequest.mockResolvedValue({
      ok: false,
      serverResponse: verificationFailureResponse,
      redirectUri: 'https://verifier.example/failed',
    })

    await captureRejection(
      acceptPresentationRequest(agent as unknown as HekaWalletAgent, {
        submissionParams: pexSubmissionParams([sdJwtVcRecord('record-1')]),
        selectedCredentials: {},
      })
    )

    expect(Linking.openURL).toHaveBeenCalledWith('https://verifier.example/failed')
  })
})
