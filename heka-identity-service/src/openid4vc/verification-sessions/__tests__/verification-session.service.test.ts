import { OpenId4VcVerificationSessionState } from '@credo-ts/openid4vc'
import { UnprocessableEntityException } from '@nestjs/common'

import { OpenId4VcVerificationSessionCreateRequestDto } from '../dto'
import { OpenId4VcVerificationSessionService } from '../verification-session.service'

const makeVerificationSession = (overrides: Record<string, unknown> = {}) => ({
  id: 'session-1',
  verifierId: 'verifier-1',
  type: 'OpenId4VcVerificationSessionRecord',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  state: OpenId4VcVerificationSessionState.RequestCreated,
  authorizationRequestJwt: 'signed.jwt.here',
  authorizationRequestUri: 'https://example.com/auth-request/123',
  authorizationResponsePayload: undefined,
  ...overrides,
})

const makeTenantAgent = (overrides: {
  didDocument?: any
  createAuthorizationRequestResult?: any
  verifyAuthorizationResponseResult?: any
  verifyAuthorizationResponseError?: Error
}) => {
  const createAuthorizationRequest = jest.fn().mockResolvedValue(
    overrides.createAuthorizationRequestResult ?? {
      authorizationRequest: 'openid4vp://...',
      verificationSession: makeVerificationSession(),
      authorizationRequestObject: { response_mode: 'direct_post.jwt' },
    },
  )

  const verifyAuthorizationResponse = overrides.verifyAuthorizationResponseError
    ? jest.fn().mockRejectedValue(overrides.verifyAuthorizationResponseError)
    : jest.fn().mockResolvedValue(
        overrides.verifyAuthorizationResponseResult ?? {
          verificationSession: makeVerificationSession({ state: OpenId4VcVerificationSessionState.ResponseVerified }),
        },
      )

  return {
    dids: {
      resolve: jest.fn().mockResolvedValue({
        didDocument: 'didDocument' in overrides
          ? overrides.didDocument
          : { verificationMethod: [{ id: 'did:key:z6Mk123#z6Mk123' }] },
      }),
    },
    openid4vc: {
      verifier: {
        createAuthorizationRequest,
        verifyAuthorizationResponse,
      },
    },
    dependencyManager: { resolve: jest.fn() },
  } as any
}

describe('OpenId4VcVerificationSessionService', () => {
  let service: OpenId4VcVerificationSessionService

  beforeEach(() => {
    service = new OpenId4VcVerificationSessionService()
  })

  const baseDto: OpenId4VcVerificationSessionCreateRequestDto = {
    publicVerifierId: 'verifier-1',
    requestSigner: { method: 'did', did: 'did:key:z6Mk123#z6Mk123' },
    presentationExchange: {
      definition: {
        id: 'pd-1',
        input_descriptors: [{ id: 'desc-1', constraints: { fields: [{ path: ['$.age'] }] } }],
      } as any,
    },
  }

  describe('createRequest', () => {
    it('creates a direct_post request and does not return authorizationRequestObject', async () => {
      const tenantAgent = makeTenantAgent({
        createAuthorizationRequestResult: {
          authorizationRequest: 'openid4vp://?request_uri=https://example.com/req/abc',
          verificationSession: makeVerificationSession(),
          authorizationRequestObject: { response_mode: 'direct_post.jwt', nonce: 'abc' },
        },
      })

      const result = await service.createRequest(tenantAgent, baseDto)

      expect(result.authorizationRequest).toBe('openid4vp://?request_uri=https://example.com/req/abc')
      expect(result.authorizationRequestObject).toBeUndefined()
      expect(result.verificationSession.state).toBe(OpenId4VcVerificationSessionState.RequestCreated)
    })

    it('passes responseMode and expectedOrigins to createAuthorizationRequest', async () => {
      const dto: OpenId4VcVerificationSessionCreateRequestDto = {
        ...baseDto,
        responseMode: 'dc_api',
        expectedOrigins: ['https://example.com'],
        version: 'v1',
      }
      const authorizationRequestObject = { response_mode: 'dc_api', nonce: 'xyz', client_id: 'verifier-1' }
      const tenantAgent = makeTenantAgent({
        createAuthorizationRequestResult: {
          authorizationRequest: 'openid4vp://?request_uri=https://example.com/req/def',
          verificationSession: makeVerificationSession(),
          authorizationRequestObject,
        },
      })

      await service.createRequest(tenantAgent, dto)

      expect(tenantAgent.openid4vc.verifier.createAuthorizationRequest).toHaveBeenCalledWith(
        expect.objectContaining({ responseMode: 'dc_api', expectedOrigins: ['https://example.com'] }),
      )
    })

    it('returns authorizationRequestObject when responseMode is dc_api', async () => {
      const authorizationRequestObject = { response_mode: 'dc_api', nonce: 'xyz' }
      const tenantAgent = makeTenantAgent({
        createAuthorizationRequestResult: {
          authorizationRequest: 'openid4vp://...',
          verificationSession: makeVerificationSession(),
          authorizationRequestObject,
        },
      })

      const result = await service.createRequest(tenantAgent, { ...baseDto, responseMode: 'dc_api' })

      expect(result.authorizationRequestObject).toEqual(authorizationRequestObject)
    })

    it('returns authorizationRequestObject when responseMode is dc_api.jwt', async () => {
      const authorizationRequestObject = { payload: 'signed.jwt', response_mode: 'dc_api.jwt' }
      const tenantAgent = makeTenantAgent({
        createAuthorizationRequestResult: {
          authorizationRequest: 'openid4vp://...',
          verificationSession: makeVerificationSession(),
          authorizationRequestObject,
        },
      })

      const result = await service.createRequest(tenantAgent, { ...baseDto, responseMode: 'dc_api.jwt' })

      expect(result.authorizationRequestObject).toEqual(authorizationRequestObject)
    })

    it('throws UnprocessableEntityException when DID has no verification methods', async () => {
      const tenantAgent = makeTenantAgent({ didDocument: { verificationMethod: [] } })

      await expect(service.createRequest(tenantAgent, baseDto)).rejects.toThrow(UnprocessableEntityException)
    })

    it('throws UnprocessableEntityException when DID document is null', async () => {
      const tenantAgent = makeTenantAgent({ didDocument: null })

      await expect(service.createRequest(tenantAgent, baseDto)).rejects.toThrow(UnprocessableEntityException)
    })
  })

  describe('verifyDcApiResponse', () => {
    it('calls verifyAuthorizationResponse with the correct arguments', async () => {
      const tenantAgent = makeTenantAgent({
        verifyAuthorizationResponseResult: {
          verificationSession: makeVerificationSession({ state: OpenId4VcVerificationSessionState.ResponseVerified }),
        },
      })
      const authorizationResponse = { vp_token: 'some.token', state: 'abc' }

      const result = await service.verifyDcApiResponse(
        tenantAgent,
        'session-1',
        authorizationResponse,
        'https://example.com',
      )

      expect(tenantAgent.openid4vc.verifier.verifyAuthorizationResponse).toHaveBeenCalledWith({
        verificationSessionId: 'session-1',
        authorizationResponse,
        origin: 'https://example.com',
      })
      expect(result.state).toBe(OpenId4VcVerificationSessionState.ResponseVerified)
      expect(result.id).toBe('session-1')
    })

    it('propagates errors from verifyAuthorizationResponse', async () => {
      const tenantAgent = makeTenantAgent({
        verifyAuthorizationResponseError: new Error('Invalid VP token'),
      })

      await expect(
        service.verifyDcApiResponse(tenantAgent, 'bad-session', { vp_token: 'invalid' }, 'https://example.com'),
      ).rejects.toThrow('Invalid VP token')
    })
  })
})
