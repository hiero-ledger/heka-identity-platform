import { createMock } from '@golevelup/ts-vitest'
import { ConflictException, BadRequestException } from '@nestjs/common'

import { TenantAgent } from 'common/agent'

import { UpdateIssuerSupportedCredentialsAction } from '../dto/update-issuer.dto'
import { OpenId4VcIssuerService } from '../issuer.service'

describe('OpenId4VcIssuerService', () => {
  let service: OpenId4VcIssuerService
  let tenantAgent: TenantAgent

  beforeEach(() => {
    service = new OpenId4VcIssuerService()
    tenantAgent = createMock<TenantAgent>({
      openid4vc: {
        issuer: {
          getAllIssuers: vi.fn(),
          createIssuer: vi.fn(),
          getIssuerByIssuerId: vi.fn(),
          updateIssuerMetadata: vi.fn(),
        },
      } as any,
      context: {
        resolve: vi.fn().mockReturnValue({
          supportedBackendsForOperation: vi.fn().mockReturnValue([]),
        }),
      } as any,
      dids: {
        getCreatedDids: vi.fn(),
      } as any,
    })
  })

  describe('createIssuer', () => {
    test('should create an issuer when no duplicate exists', async () => {
      const options = {
        publicIssuerId: 'did:key:z6Mk1234',
        credentialsSupported: [],
        display: [{ name: 'Test Issuer' }],
      } as any

      ;(tenantAgent.openid4vc.issuer.getAllIssuers as any).mockResolvedValue([])

      const mockIssuerRecord = {
        id: 'record-1',
        issuerId: 'did:key:z6Mk1234',
        credentialConfigurationsSupported: {},
        display: [{ name: 'Test Issuer' }],
        type: 'OpenId4VcIssuerRecord',
        createdAt: new Date(),
        accessTokenPublicJwk: undefined,
      }
      ;(tenantAgent.openid4vc.issuer.createIssuer as any).mockResolvedValue(mockIssuerRecord)

      const result = await service.createIssuer(tenantAgent, options)

      expect(tenantAgent.openid4vc.issuer.getAllIssuers).toHaveBeenCalledWith()
      expect(tenantAgent.openid4vc.issuer.createIssuer).toHaveBeenCalledWith(
        expect.objectContaining({ issuerId: 'did:key:z6Mk1234' }),
      )
      expect(result).toBeDefined()
      expect(result.publicIssuerId).toBe('did:key:z6Mk1234')
    })

    test('should throw ConflictException if issuer already exists', async () => {
      const options = {
        publicIssuerId: 'did:key:z6Mk1234',
        credentialsSupported: [],
      } as any

      ;(tenantAgent.openid4vc.issuer.getAllIssuers as any).mockResolvedValue([{ issuerId: 'did:key:z6Mk1234' }])

      await expect(service.createIssuer(tenantAgent, options)).rejects.toThrow(ConflictException)
      expect(tenantAgent.openid4vc.issuer.getAllIssuers).toHaveBeenCalledWith()
    })
  })

  describe('find', () => {
    test('should return matching issuers', async () => {
      const mockIssuers = [
        {
          id: 'record-1',
          issuerId: 'did:key:z6Mk1234',
          credentialConfigurationsSupported: {},
          type: 'OpenId4VcIssuerRecord',
          createdAt: new Date(),
          accessTokenPublicJwk: undefined,
        },
      ]
      ;(tenantAgent.openid4vc.issuer.getAllIssuers as any).mockResolvedValue(mockIssuers)

      const result = await service.find(tenantAgent, 'did:key:z6Mk1234')

      expect(tenantAgent.openid4vc.issuer.getAllIssuers).toHaveBeenCalledWith()
      expect(result).toHaveLength(1)
      expect(result[0].publicIssuerId).toBe('did:key:z6Mk1234')
    })

    test('should return empty array when no issuers match', async () => {
      ;(tenantAgent.openid4vc.issuer.getAllIssuers as any).mockResolvedValue([])

      const result = await service.find(tenantAgent, 'did:key:z6MkNonExistent')

      expect(tenantAgent.openid4vc.issuer.getAllIssuers).toHaveBeenCalledWith()
      expect(result).toHaveLength(0)
    })
  })

  describe('updateIssuerMetadata', () => {
    const mockIssuerRecord = {
      id: 'record-1',
      issuerId: 'issuer-1',
      credentialConfigurationsSupported: {
        'cred-1': { format: 'vc+sd-jwt', vct: 'https://example.com/vct' },
      },
      display: [{ name: 'Original' }],
      type: 'OpenId4VcIssuerRecord',
      createdAt: new Date(),
      accessTokenPublicJwk: undefined,
    }

    test('should replace issuer metadata with Replace action', async () => {
      ;(tenantAgent.openid4vc.issuer.getIssuerByIssuerId as any).mockResolvedValue(mockIssuerRecord)
      ;(tenantAgent.openid4vc.issuer.updateIssuerMetadata as any).mockResolvedValue(undefined)

      const result = await service.updateIssuerMetadata(tenantAgent, 'issuer-1', {
        action: UpdateIssuerSupportedCredentialsAction.Replace,
        display: [{ name: 'Updated' }],
      })

      expect(tenantAgent.openid4vc.issuer.getIssuerByIssuerId).toHaveBeenCalledWith('issuer-1')
      expect(result).toBeDefined()
      expect(tenantAgent.openid4vc.issuer.updateIssuerMetadata).toHaveBeenCalledWith(
        expect.objectContaining({
          issuerId: 'issuer-1',
          display: [{ name: 'Updated' }],
        }),
      )
    })

    test('should add credentials with Add action', async () => {
      ;(tenantAgent.openid4vc.issuer.getIssuerByIssuerId as any).mockResolvedValue(mockIssuerRecord)
      ;(tenantAgent.openid4vc.issuer.updateIssuerMetadata as any).mockResolvedValue(undefined)

      const result = await service.updateIssuerMetadata(tenantAgent, 'issuer-1', {
        action: UpdateIssuerSupportedCredentialsAction.Add,
        credentialsSupported: [{ id: 'cred-2', format: 'vc+sd-jwt' as any, vct: 'https://example.com/vct2' }] as any,
      })

      expect(tenantAgent.openid4vc.issuer.getIssuerByIssuerId).toHaveBeenCalledWith('issuer-1')
      expect(tenantAgent.openid4vc.issuer.updateIssuerMetadata).toHaveBeenCalled()
      expect(result).toBeDefined()
    })

    test('should throw BadRequestException on duplicate credential id with Add action', async () => {
      ;(tenantAgent.openid4vc.issuer.getIssuerByIssuerId as any).mockResolvedValue(mockIssuerRecord)

      await expect(
        service.updateIssuerMetadata(tenantAgent, 'issuer-1', {
          action: UpdateIssuerSupportedCredentialsAction.Add,
          credentialsSupported: [{ id: 'cred-1', format: 'vc+sd-jwt' as any, vct: 'https://example.com/vct' }] as any,
        }),
      ).rejects.toThrow(BadRequestException)
      expect(tenantAgent.openid4vc.issuer.getIssuerByIssuerId).toHaveBeenCalledWith('issuer-1')
    })
  })

  describe('supportedCredentials', () => {
    test('should return credentials matching the format filter', async () => {
      const mockIssuer = {
        issuerId: 'issuer-1',
        credentialConfigurationsSupported: {
          'cred-1': { format: 'vc+sd-jwt', vct: 'https://example.com/vct' },
          'cred-2': { format: 'jwt_vc_json', credential_definition: { type: ['VerifiableCredential'] } },
        },
      }
      ;(tenantAgent.openid4vc.issuer.getIssuerByIssuerId as any).mockResolvedValue(mockIssuer)

      const result = await service.supportedCredentials(tenantAgent, {
        publicIssuerId: 'issuer-1',
        credentialType: 'vc+sd-jwt',
      })

      expect(tenantAgent.openid4vc.issuer.getIssuerByIssuerId).toHaveBeenCalledWith('issuer-1')
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('cred-1')
    })

    test('should return empty array when no credentials match filter', async () => {
      const mockIssuer = {
        issuerId: 'issuer-1',
        credentialConfigurationsSupported: {
          'cred-1': { format: 'vc+sd-jwt', vct: 'https://example.com/vct' },
        },
      }
      ;(tenantAgent.openid4vc.issuer.getIssuerByIssuerId as any).mockResolvedValue(mockIssuer)

      const result = await service.supportedCredentials(tenantAgent, {
        publicIssuerId: 'issuer-1',
        credentialType: 'jwt_vc_json',
      })

      expect(tenantAgent.openid4vc.issuer.getIssuerByIssuerId).toHaveBeenCalledWith('issuer-1')
      expect(result).toHaveLength(0)
    })
  })

  describe('applyUserDisplay', () => {
    test('should update display for all issuers across all DIDs', async () => {
      const dids = [{ did: 'did:key:z6Mk1111' }, { did: 'did:key:z6Mk2222' }]
      const mockIssuerRecord = {
        id: 'record-1',
        issuerId: 'did:key:z6Mk1111',
        credentialConfigurationsSupported: {},
        display: [],
        type: 'OpenId4VcIssuerRecord',
        createdAt: new Date(),
        accessTokenPublicJwk: undefined,
      }
      ;(tenantAgent.dids.getCreatedDids as any).mockResolvedValue(dids)
      ;(tenantAgent.openid4vc.issuer.getAllIssuers as any).mockResolvedValue([mockIssuerRecord])
      ;(tenantAgent.openid4vc.issuer.getIssuerByIssuerId as any).mockResolvedValue(mockIssuerRecord)
      ;(tenantAgent.openid4vc.issuer.updateIssuerMetadata as any).mockResolvedValue(undefined)

      const display = { name: 'New Org Display' } as any

      await service.applyUserDisplay(tenantAgent, display)

      expect(tenantAgent.dids.getCreatedDids).toHaveBeenCalledWith()
      expect(tenantAgent.openid4vc.issuer.getAllIssuers).toHaveBeenCalledWith()
      expect(tenantAgent.openid4vc.issuer.updateIssuerMetadata).toHaveBeenCalled()
    })

    test('should do nothing if no DIDs exist', async () => {
      ;(tenantAgent.dids.getCreatedDids as any).mockResolvedValue([])

      await service.applyUserDisplay(tenantAgent, { name: 'Display' } as any)

      expect(tenantAgent.dids.getCreatedDids).toHaveBeenCalledWith()
      expect(tenantAgent.openid4vc.issuer.updateIssuerMetadata).not.toHaveBeenCalled()
    })
  })
})
