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
