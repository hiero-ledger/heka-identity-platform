import { SDJwtVcInstance } from '@sd-jwt/sd-jwt-vc'
import { Linking } from 'react-native'

import { acceptPresentationRequest } from '../../../src/credentials/openid4vc/acceptPresentationRequest'
import { PresentationRejectedError } from '../../../src/credentials/openid4vc/presentationErrors'
import { OpenIdPresentationSubmissionParams } from '../../../src/credentials/types'
import { HekaWalletAgent } from '../../../src/utils/agent'

jest.mock('../../../src/utils/agent', () => ({}))

// The error @sd-jwt/sd-jwt-vc's default status validator throws for a non-zero (revoked) status list entry,
// which Credo's sdJwtVc.verify returns as `error`.
async function revokedStatusError(): Promise<unknown> {
  const instance = new SDJwtVcInstance({}) as unknown as { statusValidator: (status: number) => Promise<void> }
  return instance.statusValidator(1).then(
    () => undefined,
    (error: unknown) => error
  )
}

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
    sdJwtVc: { verify: jest.fn() },
    config: { logger: { warn: jest.fn() } },
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
    expect(agent.sdJwtVc.verify).not.toHaveBeenCalled()
  })

  it('throws a rejection error without the raw response when the verifier rejects the presentation', async () => {
    agent.openid4vc.holder.acceptOpenId4VpAuthorizationRequest.mockResolvedValue({
      ok: false,
      serverResponse: verificationFailureResponse,
    })
    agent.sdJwtVc.verify.mockResolvedValue({ isValid: true })

    const error = await captureRejection(
      acceptPresentationRequest(agent as unknown as HekaWalletAgent, {
        submissionParams: pexSubmissionParams([sdJwtVcRecord('record-1')]),
        selectedCredentials: { 'descriptor-0': 'record-1' },
      })
    )

    expect(error.status).toBe(400)
    expect(error.isVerificationFailure).toBe(true)
    expect(error.revokedCredentialIds).toEqual([])
    expect(error.message).not.toContain('{')
  })

  it('still opens the redirect URI of a rejected presentation', async () => {
    agent.openid4vc.holder.acceptOpenId4VpAuthorizationRequest.mockResolvedValue({
      ok: false,
      serverResponse: verificationFailureResponse,
      redirectUri: 'https://verifier.example/failed',
    })
    agent.sdJwtVc.verify.mockResolvedValue({ isValid: true })

    await captureRejection(
      acceptPresentationRequest(agent as unknown as HekaWalletAgent, {
        submissionParams: pexSubmissionParams([sdJwtVcRecord('record-1')]),
        selectedCredentials: {},
      })
    )

    expect(Linking.openURL).toHaveBeenCalledWith('https://verifier.example/failed')
  })

  it('reports the presented SD-JWT VCs that the issuer revoked (presentation exchange)', async () => {
    agent.openid4vc.holder.acceptOpenId4VpAuthorizationRequest.mockResolvedValue({
      ok: false,
      serverResponse: verificationFailureResponse,
    })
    agent.sdJwtVc.verify.mockImplementation(async ({ compactSdJwtVc }: { compactSdJwtVc: string }) =>
      compactSdJwtVc.startsWith('revoked') ? { isValid: false, error: await revokedStatusError() } : { isValid: true }
    )

    const error = await captureRejection(
      acceptPresentationRequest(agent as unknown as HekaWalletAgent, {
        submissionParams: pexSubmissionParams([sdJwtVcRecord('valid'), sdJwtVcRecord('revoked')]),
        selectedCredentials: { 'descriptor-0': 'valid', 'descriptor-1': 'revoked' },
      })
    )

    expect(error.revokedCredentialIds).toEqual(['revoked'])
    expect(agent.sdJwtVc.verify).toHaveBeenCalledWith({ compactSdJwtVc: 'revoked-compact~disclosure~' })
  })

  it('reports a revoked SD-JWT VC selected for a DCQL query', async () => {
    agent.openid4vc.holder.acceptOpenId4VpAuthorizationRequest.mockResolvedValue({
      ok: false,
      serverResponse: verificationFailureResponse,
    })
    agent.sdJwtVc.verify.mockResolvedValue({ isValid: false, error: await revokedStatusError() })

    const error = await captureRejection(
      acceptPresentationRequest(agent as unknown as HekaWalletAgent, {
        submissionParams: dcqlSubmissionParams(sdJwtVcRecord('dcql-record')),
        selectedCredentials: { employee: 'dcql-record' },
      })
    )

    expect(error.revokedCredentialIds).toEqual(['dcql-record'])
  })

  it('does not fetch a status for a credential without a status list entry', async () => {
    agent.openid4vc.holder.acceptOpenId4VpAuthorizationRequest.mockResolvedValue({
      ok: false,
      serverResponse: verificationFailureResponse,
    })

    const error = await captureRejection(
      acceptPresentationRequest(agent as unknown as HekaWalletAgent, {
        submissionParams: pexSubmissionParams([sdJwtVcRecord('no-status', { withStatus: false })]),
        selectedCredentials: {},
      })
    )

    expect(agent.sdJwtVc.verify).not.toHaveBeenCalled()
    expect(error.revokedCredentialIds).toEqual([])
  })

  it('does not call a credential revoked when its status cannot be checked, and logs no credential', async () => {
    agent.openid4vc.holder.acceptOpenId4VpAuthorizationRequest.mockResolvedValue({
      ok: false,
      serverResponse: verificationFailureResponse,
    })
    agent.sdJwtVc.verify
      .mockResolvedValueOnce({ isValid: false, error: new Error('Received invalid response with status 404') })
      .mockRejectedValueOnce(new Error('Network request failed'))

    const error = await captureRejection(
      acceptPresentationRequest(agent as unknown as HekaWalletAgent, {
        submissionParams: pexSubmissionParams([sdJwtVcRecord('unreachable'), sdJwtVcRecord('offline')]),
        selectedCredentials: {},
      })
    )

    expect(error.revokedCredentialIds).toEqual([])
    expect(agent.config.logger.warn).toHaveBeenCalledTimes(2)
    expect(agent.config.logger.warn).toHaveBeenCalledWith('Could not verify the status of an SD-JWT VC', {
      credentialRecordId: 'unreachable',
      error: 'Received invalid response with status 404',
    })
    expect(JSON.stringify(agent.config.logger.warn.mock.calls)).not.toContain('disclosure')
  })

  it('skips the status check for credentials that are not SD-JWT VCs', async () => {
    agent.openid4vc.holder.acceptOpenId4VpAuthorizationRequest.mockResolvedValue({
      ok: false,
      serverResponse: verificationFailureResponse,
    })

    const error = await captureRejection(
      acceptPresentationRequest(agent as unknown as HekaWalletAgent, {
        submissionParams: pexSubmissionParams([{ id: 'w3c-record', type: 'W3cCredentialRecord' }]),
        selectedCredentials: {},
      })
    )

    expect(agent.sdJwtVc.verify).not.toHaveBeenCalled()
    expect(error.revokedCredentialIds).toEqual([])
  })
})
