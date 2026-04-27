import { createMock } from '@golevelup/ts-vitest'
import { InternalServerErrorException, UnprocessableEntityException } from '@nestjs/common'

import { TenantAgent } from 'common/agent'
import { Role } from 'common/auth'
import { Logger } from 'common/logger'
import { ProtocolType } from 'common/types'
import { CredentialService } from 'credential/credential.service'
import { IssuanceTemplateService } from 'issuance-template'
import { OpenId4VcIssuanceSessionService } from 'openid4vc/issuance-sessions/issuance-session.service'
import { OpenId4VcVerificationSessionService } from 'openid4vc/verification-sessions/verification-session.service'
import { ProofService } from 'proof/proof.service'
import { VerificationTemplateService } from 'verification-template'

import {
  connectionRecordStub,
  credentialExchangeRecordStub,
  proofExchangeRecordStub,
} from '../../../test/helpers/mock-records'
import { CredentialV2Service } from '../credential-v2.service'

describe('CredentialV2Service', () => {
  let credentialV2Service: CredentialV2Service
  let logger: Logger
  let issuanceTemplateService: IssuanceTemplateService
  let verificationTemplateService: VerificationTemplateService
  let credentialService: CredentialService
  let proofService: ProofService
  let issuanceSessionService: OpenId4VcIssuanceSessionService
  let verificationSessionService: OpenId4VcVerificationSessionService
  let tenantAgent: TenantAgent

  const authInfo = {
    userId: 'user-1',
    user: { id: 'user-1' } as any,
    userName: 'testuser',
    role: Role.Admin,
    orgId: '1',
    walletId: 'Administration_user-1',
    tenantId: 'tenant-1',
  }

  beforeEach(() => {
    logger = createMock<Logger>()
    issuanceTemplateService = createMock<IssuanceTemplateService>()
    verificationTemplateService = createMock<VerificationTemplateService>()
    credentialService = createMock<CredentialService>()
    proofService = createMock<ProofService>()
    issuanceSessionService = createMock<OpenId4VcIssuanceSessionService>()
    verificationSessionService = createMock<OpenId4VcVerificationSessionService>()
    credentialV2Service = new CredentialV2Service(
      logger,
      issuanceTemplateService,
      verificationTemplateService,
      credentialService,
      proofService,
      issuanceSessionService,
      verificationSessionService,
    )
    tenantAgent = createMock<TenantAgent>({
      didcomm: {
        connections: { findById: vi.fn() },
      } as any,
    })
  })

  describe('offerByTemplate', () => {
    test('routes to Aries offer and returns response', async () => {
      const template = {
        protocol: ProtocolType.Aries,
        credentialFormat: 'AnoncredsIndy',
        network: 'indy',
        did: 'did:indy:z1',
        schema: {
          registrations: [
            {
              protocol: ProtocolType.Aries,
              network: 'indy',
              did: 'did:indy:z1',
              credentials: { credentialDefinitionId: 'creddef-1' },
            },
          ],
        },
      }
      vi.mocked(issuanceTemplateService.getTemplateById).mockResolvedValue(template as any)

      const mockConn = connectionRecordStub({ id: 'conn-1' })
      vi.mocked(tenantAgent.didcomm.connections.findById).mockResolvedValue(mockConn)

      vi.mocked(credentialService.offer).mockResolvedValue(
        credentialExchangeRecordStub({ id: 'cred-1', state: 'offer-sent' }),
      )

      const result = await credentialV2Service.offerByTemplate(tenantAgent, authInfo, {
        templateId: 'template-1',
        connectionId: 'conn-1',
        credentials: [{ name: 'field1', value: 'val1' }],
      } as any)

      expect(issuanceTemplateService.getTemplateById).toHaveBeenCalledWith(authInfo, 'template-1')
      expect(tenantAgent.didcomm.connections.findById).toHaveBeenCalledWith('conn-1')
      expect(credentialService.offer).toHaveBeenCalledWith(tenantAgent, expect.anything())
      expect(result.id).toBe('cred-1')
      expect(result.state).toBe('offer-sent')
      expect(result.offer).toBeUndefined()
    })

    test('routes to OID4VC offer and returns response', async () => {
      const template = {
        protocol: ProtocolType.Oid4vc,
        credentialFormat: 'vc+sd-jwt',
        network: 'key',
        did: 'did:key:z1',
        schema: {
          name: 'TestSchema',
          registrations: [
            {
              protocol: ProtocolType.Oid4vc,
              network: 'key',
              did: 'did:key:z1',
              credentials: { supportedCredentialId: 'TestSchema:key:SdJwtVc' },
            },
          ],
        },
      }
      vi.mocked(issuanceTemplateService.getTemplateById).mockResolvedValue(template as any)

      vi.mocked(issuanceSessionService.offer).mockResolvedValue({
        issuanceSession: { id: 'session-1', state: 'OfferCreated' },
        credentialOffer: 'openid-credential-offer://...',
      } as any)

      const result = await credentialV2Service.offerByTemplate(tenantAgent, authInfo, {
        templateId: 'template-2',
        credentials: [{ name: 'f1', value: 'v1' }],
      } as any)

      expect(issuanceTemplateService.getTemplateById).toHaveBeenCalledWith(authInfo, 'template-2')
      expect(issuanceSessionService.offer).toHaveBeenCalledWith(authInfo, tenantAgent, expect.anything())
      expect(result.id).toBe('session-1')
      expect(result.state).toBe('OfferCreated')
      expect(result.offer).toBe('openid-credential-offer://...')
    })

    test('throws InternalServerErrorException for unsupported protocol', async () => {
      vi.mocked(issuanceTemplateService.getTemplateById).mockResolvedValue({ protocol: 'Unknown' } as any)

      await expect(
        credentialV2Service.offerByTemplate(tenantAgent, authInfo, {
          templateId: 'template-bad',
          credentials: [],
        } as any),
      ).rejects.toThrow(InternalServerErrorException)
      expect(issuanceTemplateService.getTemplateById).toHaveBeenCalledWith(authInfo, 'template-bad')
    })
  })

  describe('offerForAries', () => {
    test('throws UnprocessableEntityException when connectionId is missing', async () => {
      const template = { protocol: ProtocolType.Aries, schema: { registrations: [] } }

      await expect(
        credentialV2Service.offerForAries(tenantAgent, template as any, { credentials: [] } as any),
      ).rejects.toThrow(UnprocessableEntityException)
    })

    test('throws UnprocessableEntityException when connection not found', async () => {
      vi.mocked(tenantAgent.didcomm.connections.findById).mockResolvedValue(null)

      const template = { protocol: ProtocolType.Aries, schema: { registrations: [] } }

      await expect(
        credentialV2Service.offerForAries(
          tenantAgent,
          template as any,
          {
            connectionId: 'bad-conn',
            credentials: [],
          } as any,
        ),
      ).rejects.toThrow(UnprocessableEntityException)
      expect(tenantAgent.didcomm.connections.findById).toHaveBeenCalledWith('bad-conn')
    })

    test('throws UnprocessableEntityException when schema registration not found', async () => {
      vi.mocked(tenantAgent.didcomm.connections.findById).mockResolvedValue(connectionRecordStub({ id: 'conn-1' }))

      const template = {
        protocol: ProtocolType.Aries,
        network: 'indy',
        did: 'did:indy:z1',
        schema: { registrations: [] },
      }

      await expect(
        credentialV2Service.offerForAries(
          tenantAgent,
          template as any,
          {
            connectionId: 'conn-1',
            credentials: [],
          } as any,
        ),
      ).rejects.toThrow(UnprocessableEntityException)
      expect(tenantAgent.didcomm.connections.findById).toHaveBeenCalledWith('conn-1')
    })
  })

  describe('proofByTemplate', () => {
    test('routes to Aries proof and returns response', async () => {
      const template = {
        protocol: ProtocolType.Aries,
        credentialFormat: 'AnoncredsIndy',
        network: 'indy',
        did: 'did:indy:z1',
        name: 'Test Template',
        schema: {
          name: 'TestSchema',
          registrations: [{ protocol: ProtocolType.Aries, network: 'indy', did: 'did:indy:z1', credentials: {} }],
        },
      }
      vi.mocked(verificationTemplateService.getTemplateById).mockResolvedValue(template as any)

      vi.mocked(tenantAgent.didcomm.connections.findById).mockResolvedValue(connectionRecordStub({ id: 'conn-1' }))

      vi.mocked(proofService.request).mockResolvedValue(
        proofExchangeRecordStub({ id: 'proof-1', state: 'request-sent' }),
      )

      const result = await credentialV2Service.proofByTemplate(tenantAgent, authInfo, {
        templateId: 'vtemplate-1',
        connectionId: 'conn-1',
        fields: ['name', 'age'],
      } as any)

      expect(verificationTemplateService.getTemplateById).toHaveBeenCalledWith(authInfo, 'vtemplate-1')
      expect(tenantAgent.didcomm.connections.findById).toHaveBeenCalledWith('conn-1')
      expect(proofService.request).toHaveBeenCalledWith(tenantAgent, expect.anything())
      expect(result.id).toBe('proof-1')
      expect(result.state).toBe('request-sent')
      expect(result.request).toBeUndefined()
    })

    test('routes to OID4VC proof and returns response', async () => {
      const template = {
        protocol: ProtocolType.Oid4vc,
        credentialFormat: 'vc+sd-jwt',
        network: 'key',
        did: 'did:key:z1',
        name: 'VTemplate',
        schema: {
          name: 'TestSchema',
          registrations: [{ protocol: ProtocolType.Oid4vc, network: 'key', did: 'did:key:z1', credentials: {} }],
        },
      }
      vi.mocked(verificationTemplateService.getTemplateById).mockResolvedValue(template as any)

      vi.mocked(verificationSessionService.createRequest).mockResolvedValue({
        verificationSession: { id: 'vsession-1', state: 'RequestCreated' },
        authorizationRequest: 'https://auth-req-url',
      } as any)

      const result = await credentialV2Service.proofByTemplate(tenantAgent, authInfo, {
        templateId: 'vtemplate-2',
        fields: ['name'],
      } as any)

      expect(verificationTemplateService.getTemplateById).toHaveBeenCalledWith(authInfo, 'vtemplate-2')
      expect(verificationSessionService.createRequest).toHaveBeenCalledWith(tenantAgent, expect.anything())
      expect(result.id).toBe('vsession-1')
      expect(result.state).toBe('RequestCreated')
      expect(result.request).toBe('https://auth-req-url')
    })

    test('throws InternalServerErrorException for unsupported protocol', async () => {
      vi.mocked(verificationTemplateService.getTemplateById).mockResolvedValue({ protocol: 'Unknown' } as any)

      await expect(
        credentialV2Service.proofByTemplate(tenantAgent, authInfo, {
          templateId: 'bad',
          fields: [],
        } as any),
      ).rejects.toThrow(InternalServerErrorException)
      expect(verificationTemplateService.getTemplateById).toHaveBeenCalledWith(authInfo, 'bad')
    })
  })
})
