import { OpenId4VcVerificationSessionState } from '@credo-ts/openid4vc'
import { createMock } from '@golevelup/ts-vitest'
import { InternalServerErrorException, UnprocessableEntityException } from '@nestjs/common'

import { TenantAgent } from 'common/agent'

import { didResolutionResultStub, verificationSessionRecordStub } from '../../../../test/helpers/mock-records'
import { OpenId4VcVerificationSessionService } from '../verification-session.service'

describe('OpenId4VcVerificationSessionService', () => {
  let service: OpenId4VcVerificationSessionService
  let tenantAgent: TenantAgent

  const mockFindByQuery = vi.fn()
  const mockGetById = vi.fn()
  const mockDeleteById = vi.fn()
  const mockCreateAuthorizationRequest = vi.fn()
  const mockGetVerifiedAuthorizationResponse = vi.fn()
  const mockVerifyAuthorizationResponse = vi.fn()

  const makeSessionRecord = (overrides: Record<string, unknown> = {}) =>
    verificationSessionRecordStub({
      id: 'vs-1',
      verifierId: 'verifier-1',
      state: OpenId4VcVerificationSessionState.RequestCreated,
      type: 'OpenId4VcVerificationSessionRecord',
      createdAt: new Date(),
      ...overrides,
    })

  beforeEach(() => {
    service = new OpenId4VcVerificationSessionService()

    mockFindByQuery.mockReset()
    mockGetById.mockReset()
    mockDeleteById.mockReset()
    mockCreateAuthorizationRequest.mockReset()
    mockGetVerifiedAuthorizationResponse.mockReset()
    mockVerifyAuthorizationResponse.mockReset()

    tenantAgent = createMock<TenantAgent>({
      openid4vc: {
        verifier: {
          createAuthorizationRequest: mockCreateAuthorizationRequest,
          getVerifiedAuthorizationResponse: mockGetVerifiedAuthorizationResponse,
          verifyAuthorizationResponse: mockVerifyAuthorizationResponse,
        },
      },
      dependencyManager: {
        resolve: vi.fn().mockReturnValue({
          findByQuery: mockFindByQuery,
          getById: mockGetById,
          deleteById: mockDeleteById,
        }),
      },
      context: {},
      dids: {
        resolve: vi.fn(),
      },
    })
  })

  describe('getVerificationSessionsByQuery', () => {
    test('should return verification sessions matching query', async () => {
      mockFindByQuery.mockResolvedValue([makeSessionRecord()])

      const result = await service.getVerificationSessionsByQuery(tenantAgent, {
        publicVerifierId: 'verifier-1',
      })

      expect(mockFindByQuery).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ verifierId: 'verifier-1' }),
      )
      expect(result).toHaveLength(1)
      expect(result[0].publicVerifierId).toBe('verifier-1')
    })
  })

  describe('getVerificationSession', () => {
    test('should return verification session by id when state is not ResponseVerified', async () => {
      mockGetById.mockResolvedValue(makeSessionRecord())

      const result = await service.getVerificationSession(tenantAgent, 'vs-1')

      expect(mockGetById).toHaveBeenCalledWith(expect.anything(), 'vs-1')
      expect(result.id).toBe('vs-1')
      expect(result.publicVerifierId).toBe('verifier-1')
      expect(result.sharedAttributes).toBeUndefined()
    })

    test('should extract attributes from sd-jwt presentation when state is ResponseVerified', async () => {
      mockGetById.mockResolvedValue(makeSessionRecord({ state: OpenId4VcVerificationSessionState.ResponseVerified }))

      mockGetVerifiedAuthorizationResponse.mockResolvedValue({
        presentationExchange: {
          presentations: [
            {
              claimFormat: 'dc+sd-jwt',
              header: { typ: 'vc+sd-jwt' },
              prettyClaims: {
                vct: 'https://example.com/vct',
                cnf: {},
                iss: 'did:key:z6Mk1234',
                iat: 123456,
                name: 'John Doe',
                age: 30,
              },
            },
          ],
        },
      })

      const result = await service.getVerificationSession(tenantAgent, 'vs-1')

      expect(mockGetById).toHaveBeenCalledWith(expect.anything(), 'vs-1')
      expect(mockGetVerifiedAuthorizationResponse).toHaveBeenCalledWith('vs-1')
      expect(result.sharedAttributes).toBeDefined()
      expect(result.sharedAttributes).toEqual({ name: 'John Doe', age: 30 })
    })

    test('should extract attributes from jwt_vc_json presentation when state is ResponseVerified', async () => {
      mockGetById.mockResolvedValue(makeSessionRecord({ state: OpenId4VcVerificationSessionState.ResponseVerified }))

      mockGetVerifiedAuthorizationResponse.mockResolvedValue({
        presentationExchange: {
          presentations: [
            {
              jwt: { header: { typ: 'JWT' } },
              presentation: {
                verifiableCredential: [
                  {
                    credentialSubject: {
                      claims: { name: 'Jane Doe', email: 'jane@example.com' },
                    },
                  },
                ],
              },
            },
          ],
        },
      })

      const result = await service.getVerificationSession(tenantAgent, 'vs-1')

      expect(mockGetById).toHaveBeenCalledWith(expect.anything(), 'vs-1')
      expect(mockGetVerifiedAuthorizationResponse).toHaveBeenCalledWith('vs-1')
      expect(result.sharedAttributes).toEqual({ name: 'Jane Doe', email: 'jane@example.com' })
    })

    test('should extract attributes from mdoc presentation when state is ResponseVerified', async () => {
      mockGetById.mockResolvedValue(makeSessionRecord({ state: OpenId4VcVerificationSessionState.ResponseVerified }))

      mockGetVerifiedAuthorizationResponse.mockResolvedValue({
        presentationExchange: {
          presentations: [
            {
              claimFormat: 'mso_mdoc',
              issuerClaims: {
                'org.iso.18013.5.1.mDL': {
                  'org.iso.18013.5.1': { given_name: 'Alice', family_name: 'Smith' },
                },
              },
            },
          ],
        },
      })

      const result = await service.getVerificationSession(tenantAgent, 'vs-1')

      expect(mockGetById).toHaveBeenCalledWith(expect.anything(), 'vs-1')
      expect(mockGetVerifiedAuthorizationResponse).toHaveBeenCalledWith('vs-1')
      expect(result.sharedAttributes).toEqual({ given_name: 'Alice', family_name: 'Smith' })
    })

    test('should extract attributes from dcql presentations when state is ResponseVerified', async () => {
      mockGetById.mockResolvedValue(makeSessionRecord({ state: OpenId4VcVerificationSessionState.ResponseVerified }))

      mockGetVerifiedAuthorizationResponse.mockResolvedValue({
        presentationExchange: undefined,
        dcql: {
          presentations: {
            credentialQuery1: [
              {
                claimFormat: 'dc+sd-jwt',
                header: { typ: 'vc+sd-jwt' },
                prettyClaims: {
                  vct: 'https://example.com/vct',
                  cnf: {},
                  iss: 'did:key:z6Mk1234',
                  iat: 123456,
                  degree: 'Bachelor',
                },
              },
            ],
          },
        },
      })

      const result = await service.getVerificationSession(tenantAgent, 'vs-1')

      expect(mockGetById).toHaveBeenCalledWith(expect.anything(), 'vs-1')
      expect(mockGetVerifiedAuthorizationResponse).toHaveBeenCalledWith('vs-1')
      expect(result.sharedAttributes).toEqual({ degree: 'Bachelor' })
    })

    test('should throw InternalServerErrorException when no presentations exist for ResponseVerified state', async () => {
      mockGetById.mockResolvedValue(makeSessionRecord({ state: OpenId4VcVerificationSessionState.ResponseVerified }))

      mockGetVerifiedAuthorizationResponse.mockResolvedValue({
        presentationExchange: undefined,
        dcql: undefined,
      })

      await expect(service.getVerificationSession(tenantAgent, 'vs-1')).rejects.toThrow(InternalServerErrorException)
      expect(mockGetById).toHaveBeenCalledWith(expect.anything(), 'vs-1')
      expect(mockGetVerifiedAuthorizationResponse).toHaveBeenCalledWith('vs-1')
    })
  })

  describe('deleteVerificationSession', () => {
    test('should delete a verification session by id', async () => {
      mockDeleteById.mockResolvedValue(undefined)

      await service.deleteVerificationSession(tenantAgent, 'vs-1')

      expect(mockDeleteById).toHaveBeenCalledWith(expect.anything(), 'vs-1')
    })
  })

  describe('createRequest', () => {
    test('should create an authorization request successfully', async () => {
      const req = {
        publicVerifierId: 'verifier-1',
        requestSigner: { did: 'did:key:z6Mk1234' },
        presentationExchange: {
          definition: {
            id: 'def-1',
            input_descriptors: [],
          },
        },
      } as any

      vi.mocked(tenantAgent.dids.resolve).mockResolvedValue(
        didResolutionResultStub({
          didDocument: {
            verificationMethod: [{ id: 'did:key:z6Mk1234#z6Mk1234' }],
          },
        }),
      )

      mockCreateAuthorizationRequest.mockResolvedValue({
        authorizationRequest: 'openid://?request_uri=https://example.com/auth',
        verificationSession: makeSessionRecord(),
      })

      const result = await service.createRequest(tenantAgent, req)

      expect(tenantAgent.dids.resolve).toHaveBeenCalledWith('did:key:z6Mk1234')
      expect(mockCreateAuthorizationRequest).toHaveBeenCalledWith(expect.objectContaining({ verifierId: 'verifier-1' }))
      expect(result.authorizationRequest).toBe('openid://?request_uri=https://example.com/auth')
      expect(result.verificationSession.publicVerifierId).toBe('verifier-1')
    })

    test('should throw UnprocessableEntityException when DID cannot be resolved', async () => {
      const req = {
        publicVerifierId: 'verifier-1',
        requestSigner: { did: 'did:key:z6MkBad' },
        presentationExchange: {
          definition: {
            id: 'def-1',
            input_descriptors: [],
          },
        },
      } as any

      vi.mocked(tenantAgent.dids.resolve).mockResolvedValue(didResolutionResultStub({ didDocument: null }))

      await expect(service.createRequest(tenantAgent, req)).rejects.toThrow(UnprocessableEntityException)
      expect(tenantAgent.dids.resolve).toHaveBeenCalledWith('did:key:z6MkBad')
    })

    test('should throw UnprocessableEntityException when DID document has no verification methods', async () => {
      const req = {
        publicVerifierId: 'verifier-1',
        requestSigner: { did: 'did:key:z6MkEmpty' },
        presentationExchange: {
          definition: {
            id: 'def-1',
            input_descriptors: [],
          },
        },
      } as any

      vi.mocked(tenantAgent.dids.resolve).mockResolvedValue(
        didResolutionResultStub({ didDocument: { verificationMethod: [] } }),
      )

      await expect(service.createRequest(tenantAgent, req)).rejects.toThrow(UnprocessableEntityException)
      expect(tenantAgent.dids.resolve).toHaveBeenCalledWith('did:key:z6MkEmpty')
    })

    test('should throw UnprocessableEntityException when both presentationExchange and dcql are missing', async () => {
      const req = {
        publicVerifierId: 'verifier-1',
        requestSigner: { did: 'did:key:z6MkMissing' },
      } as any

      await expect(service.createRequest(tenantAgent, req)).rejects.toThrow(UnprocessableEntityException)
      expect(tenantAgent.dids.resolve).not.toHaveBeenCalled()
      expect(mockCreateAuthorizationRequest).not.toHaveBeenCalled()
    })

    test('should use version v1 when dcql is provided and version is not specified', async () => {
      const req = {
        publicVerifierId: 'verifier-1',
        requestSigner: { did: 'did:key:z6Mk1234' },
        dcql: { query: {} },
      } as any

      vi.mocked(tenantAgent.dids.resolve).mockResolvedValue(
        didResolutionResultStub({
          didDocument: {
            verificationMethod: [{ id: 'did:key:z6Mk1234#z6Mk1234' }],
          },
        }),
      )

      mockCreateAuthorizationRequest.mockResolvedValue({
        authorizationRequest: 'openid://?request_uri=https://example.com/auth',
        verificationSession: makeSessionRecord(),
      })

      await service.createRequest(tenantAgent, req)

      expect(tenantAgent.dids.resolve).toHaveBeenCalledWith('did:key:z6Mk1234')
      expect(mockCreateAuthorizationRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          version: 'v1',
        }),
      )
    })

    test('should use version v1.draft21 when presentationExchange is provided and version is not specified', async () => {
      const req = {
        publicVerifierId: 'verifier-1',
        requestSigner: { did: 'did:key:z6Mk1234' },
        presentationExchange: {
          definition: {
            id: 'def-1',
            input_descriptors: [],
          },
        },
      } as any

      vi.mocked(tenantAgent.dids.resolve).mockResolvedValue(
        didResolutionResultStub({
          didDocument: {
            verificationMethod: [{ id: 'did:key:z6Mk1234#z6Mk1234' }],
          },
        }),
      )

      mockCreateAuthorizationRequest.mockResolvedValue({
        authorizationRequest: 'openid://?request_uri=https://example.com/auth',
        verificationSession: makeSessionRecord(),
      })

      await service.createRequest(tenantAgent, req)

      expect(mockCreateAuthorizationRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          version: 'v1.draft21',
        }),
      )
    })

    test('should respect explicitly provided version when creating authorization request', async () => {
      const req = {
        publicVerifierId: 'verifier-1',
        requestSigner: { did: 'did:key:z6Mk1234' },
        presentationExchange: {
          definition: {
            id: 'def-1',
            input_descriptors: [],
          },
        },
        version: 'v1.draft24',
      } as any

      vi.mocked(tenantAgent.dids.resolve).mockResolvedValue(
        didResolutionResultStub({
          didDocument: {
            verificationMethod: [{ id: 'did:key:z6Mk1234#z6Mk1234' }],
          },
        }),
      )

      mockCreateAuthorizationRequest.mockResolvedValue({
        authorizationRequest: 'openid://?request_uri=https://example.com/auth',
        verificationSession: makeSessionRecord(),
      })

      await service.createRequest(tenantAgent, req)

      expect(mockCreateAuthorizationRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          version: 'v1.draft24',
        }),
      )
    })

    test('should create an unsigned DCQL request for the DC API flow without resolving a DID', async () => {
      const dcql = { query: { credentials: [{ id: 'requested-credential', format: 'mso_mdoc' }] } }
      const req = {
        publicVerifierId: 'verifier-1',
        responseMode: 'dc_api',
        expectedOrigins: ['https://verifier.example.com'],
        version: 'v1',
        dcql,
      } as any

      mockCreateAuthorizationRequest.mockResolvedValue({
        authorizationRequest: 'openid4vp://?...',
        authorizationRequestObject: { response_mode: 'dc_api', nonce: 'abc' },
        verificationSession: makeSessionRecord(),
      })

      const result = await service.createRequest(tenantAgent, req)

      expect(tenantAgent.dids.resolve).not.toHaveBeenCalled()
      expect(mockCreateAuthorizationRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          requestSigner: { method: 'none' },
          responseMode: 'dc_api',
          version: 'v1',
          expectedOrigins: undefined,
          presentationExchange: undefined,
          dcql,
        }),
      )
      expect(result.authorizationRequestObject).toEqual({ response_mode: 'dc_api', nonce: 'abc' })
    })

    test('should sign the DC API request with the verifier DID and embed origins when a requestSigner is given', async () => {
      const dcql = { query: { credentials: [{ id: 'requested-credential', format: 'mso_mdoc' }] } }
      const req = {
        publicVerifierId: 'verifier-1',
        requestSigner: { did: 'did:key:z6Mk1234' },
        responseMode: 'dc_api',
        expectedOrigins: ['https://verifier.example.com'],
        version: 'v1',
        dcql,
      } as any

      vi.mocked(tenantAgent.dids.resolve).mockResolvedValue(
        didResolutionResultStub({
          didDocument: {
            verificationMethod: [{ id: 'did:key:z6Mk1234#z6Mk1234' }],
          },
        }),
      )

      mockCreateAuthorizationRequest.mockResolvedValue({
        authorizationRequest: 'openid4vp://?...',
        authorizationRequestObject: { request: 'eyJ.signed.jar' },
        verificationSession: makeSessionRecord(),
      })

      await service.createRequest(tenantAgent, req)

      expect(tenantAgent.dids.resolve).toHaveBeenCalledWith('did:key:z6Mk1234')
      expect(mockCreateAuthorizationRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          requestSigner: { method: 'did', didUrl: 'did:key:z6Mk1234#z6Mk1234' },
          responseMode: 'dc_api',
          version: 'v1',
          expectedOrigins: ['https://verifier.example.com'],
          presentationExchange: undefined,
          dcql,
        }),
      )
    })

    test('should not return authorizationRequestObject for a non-DC API request', async () => {
      const req = {
        publicVerifierId: 'verifier-1',
        requestSigner: { did: 'did:key:z6Mk1234' },
        presentationExchange: { definition: { id: 'def-1', input_descriptors: [] } },
      } as any

      vi.mocked(tenantAgent.dids.resolve).mockResolvedValue(
        didResolutionResultStub({
          didDocument: { verificationMethod: [{ id: 'did:key:z6Mk1234#z6Mk1234' }] },
        }),
      )

      mockCreateAuthorizationRequest.mockResolvedValue({
        authorizationRequest: 'openid://?request_uri=https://example.com/auth',
        authorizationRequestObject: { response_mode: 'dc_api' },
        verificationSession: makeSessionRecord(),
      })

      const result = await service.createRequest(tenantAgent, req)

      expect(result.authorizationRequestObject).toBeUndefined()
    })
  })

  describe('verifyDcApiResponse', () => {
    test('should verify the response and return the shared attributes when verified', async () => {
      mockVerifyAuthorizationResponse.mockResolvedValue({
        verificationSession: makeSessionRecord({ state: OpenId4VcVerificationSessionState.ResponseVerified }),
      })

      mockGetVerifiedAuthorizationResponse.mockResolvedValue({
        presentationExchange: {
          presentations: [
            {
              claimFormat: 'dc+sd-jwt',
              header: { typ: 'vc+sd-jwt' },
              prettyClaims: {
                vct: 'https://example.com/vct',
                cnf: {},
                iss: 'did:key:z6Mk1234',
                iat: 123456,
                age_over_18: true,
              },
            },
          ],
        },
      })

      const result = await service.verifyDcApiResponse(
        tenantAgent,
        'vs-1',
        { vp_token: 'tok' },
        'https://verifier.example.com',
      )

      expect(mockVerifyAuthorizationResponse).toHaveBeenCalledWith({
        verificationSessionId: 'vs-1',
        authorizationResponse: { vp_token: 'tok' },
        origin: 'https://verifier.example.com',
      })
      expect(mockGetVerifiedAuthorizationResponse).toHaveBeenCalledWith('vs-1')
      expect(result.state).toBe(OpenId4VcVerificationSessionState.ResponseVerified)
      expect(result.sharedAttributes).toEqual({ age_over_18: true })
    })

    test('should not resolve attributes when the response is not yet verified', async () => {
      mockVerifyAuthorizationResponse.mockResolvedValue({
        verificationSession: makeSessionRecord({ state: OpenId4VcVerificationSessionState.RequestCreated }),
      })

      const result = await service.verifyDcApiResponse(
        tenantAgent,
        'vs-1',
        { vp_token: 'tok' },
        'https://verifier.example.com',
      )

      expect(mockGetVerifiedAuthorizationResponse).not.toHaveBeenCalled()
      expect(result.sharedAttributes).toBeUndefined()
    })
  })
})
