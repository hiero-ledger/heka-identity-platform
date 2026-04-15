import { OpenId4VcVerificationSessionState } from '@credo-ts/openid4vc'
import { createMock } from '@golevelup/ts-vitest'
import { InternalServerErrorException, UnprocessableEntityException } from '@nestjs/common'
import { when } from 'vitest-when'

import { TenantAgent } from 'common/agent'

import { OpenId4VcVerificationSessionService } from '../verification-session.service'

describe('OpenId4VcVerificationSessionService', () => {
  let service: OpenId4VcVerificationSessionService
  let tenantAgent: TenantAgent

  const mockFindByQuery = vi.fn()
  const mockGetById = vi.fn()
  const mockDeleteById = vi.fn()
  const mockCreateAuthorizationRequest = vi.fn()
  const mockGetVerifiedAuthorizationResponse = vi.fn()

  const makeSessionRecord = (overrides: Record<string, unknown> = {}) => ({
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

    tenantAgent = createMock<TenantAgent>({
      openid4vc: {
        verifier: {
          createAuthorizationRequest: mockCreateAuthorizationRequest,
          getVerifiedAuthorizationResponse: mockGetVerifiedAuthorizationResponse,
        },
      } as any,
      dependencyManager: {
        resolve: vi.fn().mockReturnValue({
          findByQuery: mockFindByQuery,
          getById: mockGetById,
          deleteById: mockDeleteById,
        }),
      } as any,
      context: {} as any,
      dids: {
        resolve: vi.fn(),
      } as any,
    })
  })

  describe('getVerificationSessionsByQuery', () => {
    test('should return verification sessions matching query', async () => {
      when(mockFindByQuery)
        .calledWith(expect.anything(), expect.objectContaining({ verifierId: 'verifier-1' }))
        .thenResolve([makeSessionRecord()])

      const result = await service.getVerificationSessionsByQuery(tenantAgent, {
        publicVerifierId: 'verifier-1',
      })

      expect(result).toHaveLength(1)
      expect(result[0].publicVerifierId).toBe('verifier-1')
    })
  })

  describe('getVerificationSession', () => {
    test('should return verification session by id when state is not ResponseVerified', async () => {
      when(mockGetById).calledWith(expect.anything(), 'vs-1').thenResolve(makeSessionRecord())

      const result = await service.getVerificationSession(tenantAgent, 'vs-1')

      expect(result.id).toBe('vs-1')
      expect(result.publicVerifierId).toBe('verifier-1')
      expect(result.sharedAttributes).toBeUndefined()
    })

    test('should extract attributes from sd-jwt presentation when state is ResponseVerified', async () => {
      when(mockGetById)
        .calledWith(expect.anything(), 'vs-1')
        .thenResolve(makeSessionRecord({ state: OpenId4VcVerificationSessionState.ResponseVerified }))

      when(mockGetVerifiedAuthorizationResponse)
        .calledWith('vs-1')
        .thenResolve({
          presentationExchange: {
            presentations: [
              {
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

      expect(result.sharedAttributes).toBeDefined()
      expect(result.sharedAttributes).toEqual({ name: 'John Doe', age: 30 })
    })

    test('should extract attributes from jwt_vc_json presentation when state is ResponseVerified', async () => {
      when(mockGetById)
        .calledWith(expect.anything(), 'vs-1')
        .thenResolve(makeSessionRecord({ state: OpenId4VcVerificationSessionState.ResponseVerified }))

      when(mockGetVerifiedAuthorizationResponse)
        .calledWith('vs-1')
        .thenResolve({
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

      expect(result.sharedAttributes).toEqual({ name: 'Jane Doe', email: 'jane@example.com' })
    })

    test('should extract attributes from mdoc presentation when state is ResponseVerified', async () => {
      when(mockGetById)
        .calledWith(expect.anything(), 'vs-1')
        .thenResolve(makeSessionRecord({ state: OpenId4VcVerificationSessionState.ResponseVerified }))

      when(mockGetVerifiedAuthorizationResponse)
        .calledWith('vs-1')
        .thenResolve({
          presentationExchange: {
            presentations: [
              {
                documents: [
                  {
                    issuerSignedNamespaces: {
                      'org.iso.18013.5.1': { given_name: 'Alice', family_name: 'Smith' },
                    },
                  },
                ],
              },
            ],
          },
        })

      const result = await service.getVerificationSession(tenantAgent, 'vs-1')

      expect(result.sharedAttributes).toEqual({ given_name: 'Alice', family_name: 'Smith' })
    })

    test('should extract attributes from dcql presentations when state is ResponseVerified', async () => {
      when(mockGetById)
        .calledWith(expect.anything(), 'vs-1')
        .thenResolve(makeSessionRecord({ state: OpenId4VcVerificationSessionState.ResponseVerified }))

      when(mockGetVerifiedAuthorizationResponse)
        .calledWith('vs-1')
        .thenResolve({
          presentationExchange: undefined,
          dcql: {
            presentations: {
              credentialQuery1: [
                {
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

      expect(result.sharedAttributes).toEqual({ degree: 'Bachelor' })
    })

    test('should throw InternalServerErrorException when no presentations exist for ResponseVerified state', async () => {
      when(mockGetById)
        .calledWith(expect.anything(), 'vs-1')
        .thenResolve(makeSessionRecord({ state: OpenId4VcVerificationSessionState.ResponseVerified }))

      when(mockGetVerifiedAuthorizationResponse).calledWith('vs-1').thenResolve({
        presentationExchange: undefined,
        dcql: undefined,
      })

      await expect(service.getVerificationSession(tenantAgent, 'vs-1')).rejects.toThrow(InternalServerErrorException)
    })
  })

  describe('deleteVerificationSession', () => {
    test('should delete a verification session by id', async () => {
      when(mockDeleteById).calledWith(expect.anything(), 'vs-1').thenResolve(undefined)

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

      when(tenantAgent.dids.resolve as any)
        .calledWith('did:key:z6Mk1234')
        .thenResolve({
          didDocument: {
            verificationMethod: [{ id: 'did:key:z6Mk1234#z6Mk1234' }],
          },
        })

      when(mockCreateAuthorizationRequest)
        .calledWith(
          expect.objectContaining({
            verifierId: 'verifier-1',
          }),
        )
        .thenResolve({
          authorizationRequest: 'openid://?request_uri=https://example.com/auth',
          verificationSession: makeSessionRecord(),
        })

      const result = await service.createRequest(tenantAgent, req)

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

      when(tenantAgent.dids.resolve as any)
        .calledWith('did:key:z6MkBad')
        .thenResolve({ didDocument: null })

      await expect(service.createRequest(tenantAgent, req)).rejects.toThrow(UnprocessableEntityException)
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

      when(tenantAgent.dids.resolve as any)
        .calledWith('did:key:z6MkEmpty')
        .thenResolve({ didDocument: { verificationMethod: [] } })

      await expect(service.createRequest(tenantAgent, req)).rejects.toThrow(UnprocessableEntityException)
    })

    test('should use version v1 when dcql is provided and version is not specified', async () => {
      const req = {
        publicVerifierId: 'verifier-1',
        requestSigner: { did: 'did:key:z6Mk1234' },
        dcql: { query: {} },
      } as any

      when(tenantAgent.dids.resolve as any)
        .calledWith('did:key:z6Mk1234')
        .thenResolve({
          didDocument: {
            verificationMethod: [{ id: 'did:key:z6Mk1234#z6Mk1234' }],
          },
        })

      when(mockCreateAuthorizationRequest).calledWith(expect.anything()).thenResolve({
        authorizationRequest: 'openid://?request_uri=https://example.com/auth',
        verificationSession: makeSessionRecord(),
      })

      await service.createRequest(tenantAgent, req)

      expect(mockCreateAuthorizationRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          version: 'v1',
        }),
      )
    })
  })
})
