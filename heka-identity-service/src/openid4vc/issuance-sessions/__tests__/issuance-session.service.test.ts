import { OpenId4VciCredentialFormatProfile } from '@credo-ts/openid4vc'
import { createMock } from '@golevelup/ts-vitest'
import { UnprocessableEntityException } from '@nestjs/common'
import { ConfigType } from '@nestjs/config'
import { when } from 'vitest-when'

import { TenantAgent } from 'common/agent'
import { AuthInfo, Role } from 'common/auth'
import AgentConfig from 'config/agent'

import { StatusListService } from '../../../revocation/status-list/status-list.service'
import { OpenId4VcIssuanceSessionService } from '../issuance-session.service'

describe('OpenId4VcIssuanceSessionService', () => {
  let service: OpenId4VcIssuanceSessionService
  let tenantAgent: TenantAgent
  let statusListService: StatusListService
  let agencyConfig: ConfigType<typeof AgentConfig>
  let authInfo: AuthInfo

  const mockFindIssuanceSessionsByQuery = vi.fn()
  const mockDeleteById = vi.fn()

  beforeEach(() => {
    statusListService = createMock<StatusListService>()
    agencyConfig = {
      credentialsConfiguration: {
        OpenId4VC: {
          credentials: [
            OpenId4VciCredentialFormatProfile.SdJwtVc,
            OpenId4VciCredentialFormatProfile.JwtVcJson,
            OpenId4VciCredentialFormatProfile.JwtVcJsonLd,
            OpenId4VciCredentialFormatProfile.LdpVc,
            OpenId4VciCredentialFormatProfile.MsoMdoc,
          ],
        },
      },
    } as any

    service = new OpenId4VcIssuanceSessionService(agencyConfig, statusListService)

    mockFindIssuanceSessionsByQuery.mockReset()
    mockDeleteById.mockReset()

    tenantAgent = createMock<TenantAgent>({
      openid4vc: {
        issuer: {
          getIssuerByIssuerId: vi.fn(),
          getIssuanceSessionById: vi.fn(),
          createCredentialOffer: vi.fn(),
        },
      } as any,
      dependencyManager: {
        resolve: vi.fn().mockImplementation((token: any) => {
          // Return different mocks depending on which class is being resolved
          if (token?.name === 'OpenId4VcIssuerService' || token?.prototype?.findIssuanceSessionsByQuery) {
            return { findIssuanceSessionsByQuery: mockFindIssuanceSessionsByQuery }
          }
          return { deleteById: mockDeleteById }
        }),
      } as any,
      context: {} as any,
      dids: {
        resolve: vi.fn(),
      } as any,
    })

    authInfo = {
      userId: 'user-1',
      user: {} as any,
      userName: 'testuser',
      role: Role.Admin,
      orgId: 'org-1',
      walletId: 'wallet-1',
      tenantId: 'tenant-1',
    }
  })

  describe('getIssuanceSessionsByQuery', () => {
    test('should return issuance sessions matching query', async () => {
      const mockSessions = [
        {
          id: 'session-1',
          issuerId: 'issuer-1',
          state: 'OfferCreated',
          type: 'OpenId4VcIssuanceSessionRecord',
          createdAt: new Date(),
          credentialOfferPayload: {},
        },
      ]

      when(mockFindIssuanceSessionsByQuery)
        .calledWith(expect.anything(), expect.objectContaining({ issuerId: 'issuer-1' }))
        .thenResolve(mockSessions)

      const result = await service.getIssuanceSessionsByQuery(tenantAgent, {
        publicIssuerId: 'issuer-1',
      })

      expect(result).toHaveLength(1)
      expect(result[0].publicIssuerId).toBe('issuer-1')
    })

    test('should return empty array when no sessions match', async () => {
      when(mockFindIssuanceSessionsByQuery).calledWith(expect.anything(), expect.anything()).thenResolve([])

      const result = await service.getIssuanceSessionsByQuery(tenantAgent, {
        publicIssuerId: 'non-existent',
      })

      expect(result).toHaveLength(0)
    })
  })

  describe('getIssuanceSession', () => {
    test('should return an issuance session by id', async () => {
      const mockSession = {
        id: 'session-1',
        issuerId: 'issuer-1',
        state: 'OfferCreated',
        type: 'OpenId4VcIssuanceSessionRecord',
        createdAt: new Date(),
        credentialOfferPayload: {},
      }

      when(tenantAgent.openid4vc.issuer.getIssuanceSessionById as any)
        .calledWith('session-1')
        .thenResolve(mockSession)

      const result = await service.getIssuanceSession(tenantAgent, 'session-1')

      expect(result).toBeDefined()
      expect(result.id).toBe('session-1')
      expect(result.publicIssuerId).toBe('issuer-1')
    })
  })

  describe('deleteIssuanceSession', () => {
    test('should delete an issuance session by id', async () => {
      when(mockDeleteById).calledWith(expect.anything(), 'session-1').thenResolve(undefined)

      await service.deleteIssuanceSession(tenantAgent, 'session-1')

      expect(mockDeleteById).toHaveBeenCalledWith(expect.anything(), 'session-1')
    })
  })

  describe('offer', () => {
    test('should throw UnprocessableEntityException when credential is not in issuer supported list', async () => {
      const mockIssuer = {
        issuerId: 'issuer-1',
        credentialConfigurationsSupported: {},
      }

      when(tenantAgent.openid4vc.issuer.getIssuerByIssuerId as any)
        .calledWith('issuer-1')
        .thenResolve(mockIssuer)

      when(statusListService.getOrCreate as any)
        .calledWith(authInfo, 'issuer-1')
        .thenResolve({ id: 'sl-1', lastIndex: 0 })

      const req = {
        publicIssuerId: 'issuer-1',
        credentials: [
          {
            credentialSupportedId: 'non-existent-cred',
            format: OpenId4VciCredentialFormatProfile.SdJwtVc,
            issuer: { did: 'did:key:z6Mk1234' },
          },
        ],
        baseUri: 'https://example.com',
      } as any

      await expect(service.offer(authInfo, tenantAgent, req)).rejects.toThrow(UnprocessableEntityException)
    })

    test('should throw UnprocessableEntityException when credential format does not match supported format', async () => {
      const mockIssuer = {
        issuerId: 'issuer-1',
        credentialConfigurationsSupported: {
          'cred-1': { format: 'vc+sd-jwt', vct: 'https://example.com/vct' },
        },
      }

      when(tenantAgent.openid4vc.issuer.getIssuerByIssuerId as any)
        .calledWith('issuer-1')
        .thenResolve(mockIssuer)

      when(statusListService.getOrCreate as any)
        .calledWith(authInfo, 'issuer-1')
        .thenResolve({ id: 'sl-1', lastIndex: 0 })

      const req = {
        publicIssuerId: 'issuer-1',
        credentials: [
          {
            credentialSupportedId: 'cred-1',
            format: OpenId4VciCredentialFormatProfile.JwtVcJson,
            issuer: { did: 'did:key:z6Mk1234' },
          },
        ],
        baseUri: 'https://example.com',
      } as any

      await expect(service.offer(authInfo, tenantAgent, req)).rejects.toThrow(UnprocessableEntityException)
    })

    test('should throw UnprocessableEntityException when DID cannot be resolved', async () => {
      const mockIssuer = {
        issuerId: 'issuer-1',
        credentialConfigurationsSupported: {
          'cred-1': { format: 'vc+sd-jwt', vct: 'https://example.com/vct' },
        },
      }

      when(tenantAgent.openid4vc.issuer.getIssuerByIssuerId as any)
        .calledWith('issuer-1')
        .thenResolve(mockIssuer)

      when(statusListService.getOrCreate as any)
        .calledWith(authInfo, 'issuer-1')
        .thenResolve({ id: 'sl-1', lastIndex: 0 })

      when(tenantAgent.dids.resolve as any)
        .calledWith('did:key:z6MkBad')
        .thenResolve({ didDocument: null })

      const req = {
        publicIssuerId: 'issuer-1',
        credentials: [
          {
            credentialSupportedId: 'cred-1',
            format: OpenId4VciCredentialFormatProfile.SdJwtVc,
            issuer: { did: 'did:key:z6MkBad' },
          },
        ],
        baseUri: 'https://example.com',
      } as any

      await expect(service.offer(authInfo, tenantAgent, req)).rejects.toThrow(UnprocessableEntityException)
    })

    test('should create issuance session for SdJwtVc format without credentialStatus', async () => {
      const mockIssuer = {
        issuerId: 'issuer-1',
        credentialConfigurationsSupported: {
          'cred-sd-1': { format: 'vc+sd-jwt', vct: 'https://example.com/vct' },
        },
      }

      when(tenantAgent.openid4vc.issuer.getIssuerByIssuerId as any)
        .calledWith('issuer-1')
        .thenResolve(mockIssuer)

      when(statusListService.getOrCreate as any)
        .calledWith(authInfo, 'issuer-1')
        .thenResolve({ id: 'sl-1', lastIndex: 0 })

      when(tenantAgent.dids.resolve as any)
        .calledWith('did:key:z6MkGood')
        .thenResolve({
          didDocument: {
            verificationMethod: [{ id: 'did:key:z6MkGood#key-1' }],
          },
        })

      const mockSession = {
        id: 'session-new',
        issuerId: 'issuer-1',
        state: 'OfferCreated',
        type: 'OpenId4VcIssuanceSessionRecord',
        createdAt: new Date(),
        credentialOfferPayload: {},
      }

      when(tenantAgent.openid4vc.issuer.createCredentialOffer as any)
        .calledWith(expect.objectContaining({ issuerId: 'issuer-1' }))
        .thenResolve({
          credentialOffer: 'openid-credential-offer://...',
          issuanceSession: mockSession,
        })

      const req = {
        publicIssuerId: 'issuer-1',
        credentials: [
          {
            credentialSupportedId: 'cred-sd-1',
            format: OpenId4VciCredentialFormatProfile.SdJwtVc,
            issuer: { did: 'did:key:z6MkGood' },
            payload: { some: 'payload' },
          },
        ],
        baseUri: 'https://example.com',
      } as any

      const result = await service.offer(authInfo, tenantAgent, req)

      expect(result.credentialOffer).toBe('openid-credential-offer://...')
      expect(result.issuanceSession.id).toBe('session-new')
      // SdJwtVc does not support revocation, so addItems should NOT be called
      expect(statusListService.addItems).not.toHaveBeenCalled()
      // statusListService.location should NOT have been called for SdJwtVc either
      expect(statusListService.location).not.toHaveBeenCalled()
    })

    test('should create issuance session for JwtVcJson format WITH credentialStatus and call addItems', async () => {
      const mockIssuer = {
        issuerId: 'issuer-1',
        credentialConfigurationsSupported: {
          'cred-jwt-1': {
            format: 'jwt_vc_json',
            credential_definition: { type: ['VerifiableCredential', 'MyCred'] },
          },
        },
      }

      when(tenantAgent.openid4vc.issuer.getIssuerByIssuerId as any)
        .calledWith('issuer-1')
        .thenResolve(mockIssuer)

      when(statusListService.getOrCreate as any)
        .calledWith(authInfo, 'issuer-1')
        .thenResolve({ id: 'sl-1', lastIndex: 5 })

      when(statusListService.location as any)
        .calledWith('sl-1')
        .thenReturn('https://example.com/status-lists/sl-1')

      when(tenantAgent.dids.resolve as any)
        .calledWith('did:key:z6MkJwt')
        .thenResolve({
          didDocument: {
            verificationMethod: [{ id: 'did:key:z6MkJwt#key-1' }],
          },
        })

      when(statusListService.addItems as any)
        .calledWith(authInfo, 'sl-1', [6])
        .thenResolve(undefined)

      const mockSession = {
        id: 'session-jwt',
        issuerId: 'issuer-1',
        state: 'OfferCreated',
        type: 'OpenId4VcIssuanceSessionRecord',
        createdAt: new Date(),
        credentialOfferPayload: {},
      }

      when(tenantAgent.openid4vc.issuer.createCredentialOffer as any)
        .calledWith(expect.objectContaining({ issuerId: 'issuer-1' }))
        .thenResolve({
          credentialOffer: 'openid-credential-offer://jwt',
          issuanceSession: mockSession,
        })

      const req = {
        publicIssuerId: 'issuer-1',
        credentials: [
          {
            credentialSupportedId: 'cred-jwt-1',
            format: OpenId4VciCredentialFormatProfile.JwtVcJson,
            issuer: { did: 'did:key:z6MkJwt' },
          },
        ],
        baseUri: 'https://example.com',
      } as any

      const result = await service.offer(authInfo, tenantAgent, req)

      expect(result.credentialOffer).toBe('openid-credential-offer://jwt')
      expect(statusListService.addItems).toHaveBeenCalledWith(authInfo, 'sl-1', [6])
    })

    test('should create issuance session for JwtVcJsonLd format WITH credentialStatus', async () => {
      const mockIssuer = {
        issuerId: 'issuer-1',
        credentialConfigurationsSupported: {
          'cred-ld-1': {
            format: 'jwt_vc_json-ld',
            credential_definition: { type: ['VerifiableCredential'] },
          },
        },
      }

      when(tenantAgent.openid4vc.issuer.getIssuerByIssuerId as any)
        .calledWith('issuer-1')
        .thenResolve(mockIssuer)

      when(statusListService.getOrCreate as any)
        .calledWith(authInfo, 'issuer-1')
        .thenResolve({ id: 'sl-2', lastIndex: 10 })

      when(statusListService.location as any)
        .calledWith('sl-2')
        .thenReturn('https://example.com/status-lists/sl-2')

      when(tenantAgent.dids.resolve as any)
        .calledWith('did:key:z6MkLd')
        .thenResolve({
          didDocument: {
            verificationMethod: [{ id: 'did:key:z6MkLd#key-1' }],
          },
        })

      when(statusListService.addItems as any)
        .calledWith(authInfo, 'sl-2', [11])
        .thenResolve(undefined)

      const mockSession = {
        id: 'session-ld',
        issuerId: 'issuer-1',
        state: 'OfferCreated',
        type: 'OpenId4VcIssuanceSessionRecord',
        createdAt: new Date(),
        credentialOfferPayload: {},
      }

      when(tenantAgent.openid4vc.issuer.createCredentialOffer as any)
        .calledWith(expect.anything())
        .thenResolve({
          credentialOffer: 'openid-credential-offer://ld',
          issuanceSession: mockSession,
        })

      const req = {
        publicIssuerId: 'issuer-1',
        credentials: [
          {
            credentialSupportedId: 'cred-ld-1',
            format: OpenId4VciCredentialFormatProfile.JwtVcJsonLd,
            issuer: { did: 'did:key:z6MkLd' },
          },
        ],
        baseUri: 'https://example.com',
      } as any

      await service.offer(authInfo, tenantAgent, req)

      expect(statusListService.addItems).toHaveBeenCalledWith(authInfo, 'sl-2', [11])
    })

    test('should create issuance session for LdpVc format WITH credentialStatus', async () => {
      const mockIssuer = {
        issuerId: 'issuer-1',
        credentialConfigurationsSupported: {
          'cred-ldp-1': {
            format: 'ldp_vc',
            credential_definition: { type: ['VerifiableCredential'] },
          },
        },
      }

      when(tenantAgent.openid4vc.issuer.getIssuerByIssuerId as any)
        .calledWith('issuer-1')
        .thenResolve(mockIssuer)

      when(statusListService.getOrCreate as any)
        .calledWith(authInfo, 'issuer-1')
        .thenResolve({ id: 'sl-3', lastIndex: 0 })

      when(statusListService.location as any)
        .calledWith('sl-3')
        .thenReturn('https://example.com/status-lists/sl-3')

      when(tenantAgent.dids.resolve as any)
        .calledWith('did:key:z6MkLdp')
        .thenResolve({
          didDocument: {
            verificationMethod: [{ id: 'did:key:z6MkLdp#key-1' }],
          },
        })

      when(statusListService.addItems as any)
        .calledWith(authInfo, 'sl-3', [1])
        .thenResolve(undefined)

      const mockSession = {
        id: 'session-ldp',
        issuerId: 'issuer-1',
        state: 'OfferCreated',
        type: 'OpenId4VcIssuanceSessionRecord',
        createdAt: new Date(),
        credentialOfferPayload: {},
      }

      when(tenantAgent.openid4vc.issuer.createCredentialOffer as any)
        .calledWith(expect.anything())
        .thenResolve({
          credentialOffer: 'openid-credential-offer://ldp',
          issuanceSession: mockSession,
        })

      const req = {
        publicIssuerId: 'issuer-1',
        credentials: [
          {
            credentialSupportedId: 'cred-ldp-1',
            format: OpenId4VciCredentialFormatProfile.LdpVc,
            issuer: { did: 'did:key:z6MkLdp' },
          },
        ],
        baseUri: 'https://example.com',
      } as any

      await service.offer(authInfo, tenantAgent, req)

      expect(statusListService.addItems).toHaveBeenCalledWith(authInfo, 'sl-3', [1])
    })

    test('should create issuance session for MsoMdoc format without DID resolution or credentialStatus', async () => {
      const mockIssuer = {
        issuerId: 'issuer-1',
        credentialConfigurationsSupported: {
          'cred-mdoc-1': {
            format: 'mso_mdoc',
            doctype: 'org.iso.18013.5.1.mDL',
          },
        },
      }

      when(tenantAgent.openid4vc.issuer.getIssuerByIssuerId as any)
        .calledWith('issuer-1')
        .thenResolve(mockIssuer)

      when(statusListService.getOrCreate as any)
        .calledWith(authInfo, 'issuer-1')
        .thenResolve({ id: 'sl-mdoc', lastIndex: 0 })

      const mockSession = {
        id: 'session-mdoc',
        issuerId: 'issuer-1',
        state: 'OfferCreated',
        type: 'OpenId4VcIssuanceSessionRecord',
        createdAt: new Date(),
        credentialOfferPayload: {},
      }

      when(tenantAgent.openid4vc.issuer.createCredentialOffer as any)
        .calledWith(expect.objectContaining({ issuerId: 'issuer-1' }))
        .thenResolve({
          credentialOffer: 'openid-credential-offer://mdoc',
          issuanceSession: mockSession,
        })

      const req = {
        publicIssuerId: 'issuer-1',
        credentials: [
          {
            credentialSupportedId: 'cred-mdoc-1',
            format: OpenId4VciCredentialFormatProfile.MsoMdoc,
            namespaces: { 'org.iso.18013.5.1': { family_name: 'Doe' } },
          },
        ],
        baseUri: 'https://example.com',
      } as any

      const result = await service.offer(authInfo, tenantAgent, req)

      expect(result.credentialOffer).toBe('openid-credential-offer://mdoc')
      // MsoMdoc does not support revocation, no addItems call
      expect(statusListService.addItems).not.toHaveBeenCalled()
      // MsoMdoc uses X.509, so no DID resolution
      expect(tenantAgent.dids.resolve).not.toHaveBeenCalled()
    })

    test('should throw UnprocessableEntityException when credential format is not allowed by agency config', async () => {
      // Override config to allow no credential formats
      const restrictedConfig = {
        credentialsConfiguration: {
          OpenId4VC: {
            credentials: [],
          },
        },
      } as any

      const restrictedService = new OpenId4VcIssuanceSessionService(restrictedConfig, statusListService)

      const mockIssuer = {
        issuerId: 'issuer-1',
        credentialConfigurationsSupported: {
          'cred-1': { format: 'vc+sd-jwt', vct: 'https://example.com/vct' },
        },
      }

      when(tenantAgent.openid4vc.issuer.getIssuerByIssuerId as any)
        .calledWith('issuer-1')
        .thenResolve(mockIssuer)

      when(statusListService.getOrCreate as any)
        .calledWith(authInfo, 'issuer-1')
        .thenResolve({ id: 'sl-1', lastIndex: 0 })

      const req = {
        publicIssuerId: 'issuer-1',
        credentials: [
          {
            credentialSupportedId: 'cred-1',
            format: OpenId4VciCredentialFormatProfile.SdJwtVc,
            issuer: { did: 'did:key:z6Mk1234' },
          },
        ],
        baseUri: 'https://example.com',
      } as any

      await expect(restrictedService.offer(authInfo, tenantAgent, req)).rejects.toThrow(UnprocessableEntityException)
    })
  })

  describe('revokeIssuanceSession', () => {
    test('should throw error when credential not found', async () => {
      const mockSession = {
        id: 'session-1',
        issuanceMetadata: undefined,
      }

      when(tenantAgent.openid4vc.issuer.getIssuanceSessionById as any)
        .calledWith('session-1')
        .thenResolve(mockSession)

      await expect(service.revokeIssuanceSession(authInfo, tenantAgent, 'session-1')).rejects.toThrow(
        'Credential not found',
      )
    })

    test('should throw error when credential does not support revocation', async () => {
      const mockSession = {
        id: 'session-1',
        issuanceMetadata: {
          credentials: [{ format: 'vc+sd-jwt', credentialStatus: undefined }],
        },
      }

      when(tenantAgent.openid4vc.issuer.getIssuanceSessionById as any)
        .calledWith('session-1')
        .thenResolve(mockSession)

      await expect(service.revokeIssuanceSession(authInfo, tenantAgent, 'session-1')).rejects.toThrow(
        'Credential does not support revocation',
      )
    })

    test('should call statusListService.updateItems on successful revocation', async () => {
      const mockSession = {
        id: 'session-1',
        issuanceMetadata: {
          credentials: [
            {
              format: 'jwt_vc_json',
              credentialStatus: {
                location: 'https://example.com/status-lists/sl-123',
                index: 5,
              },
            },
          ],
        },
      }

      when(tenantAgent.openid4vc.issuer.getIssuanceSessionById as any)
        .calledWith('session-1')
        .thenResolve(mockSession)

      when(statusListService.updateItems as any)
        .calledWith(authInfo, 'sl-123', { indexes: [5], revoked: true })
        .thenResolve(undefined)

      await service.revokeIssuanceSession(authInfo, tenantAgent, 'session-1')

      expect(statusListService.updateItems).toHaveBeenCalledWith(authInfo, 'sl-123', {
        indexes: [5],
        revoked: true,
      })
    })
  })
})
