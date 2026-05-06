import { DidCommCredentialState } from '@credo-ts/didcomm'
import { createMock } from '@golevelup/ts-vitest'
import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'

import { TenantAgent } from 'common/agent'
import { AnoncredsRegistryService } from 'common/anoncreds-registry'
import { Logger } from 'common/logger'
import { RevocationRegistryService } from 'revocation/revocation-registry/revocation-registry.service'

import { connectionRecordStub, credentialExchangeRecordStub } from '../../../test/helpers/mock-records'
import { CredentialService } from '../credential.service'

describe('CredentialService', () => {
  let credentialService: CredentialService
  let logger: Logger
  let anoncredsRegistryService: AnoncredsRegistryService
  let revocationService: RevocationRegistryService
  let tenantAgent: TenantAgent
  const agentConfig = { credentialsConfiguration: { formats: ['anoncreds'] } }

  beforeEach(() => {
    logger = createMock<Logger>()
    anoncredsRegistryService = createMock<AnoncredsRegistryService>()
    revocationService = createMock<RevocationRegistryService>()
    credentialService = new CredentialService(agentConfig as any, logger, anoncredsRegistryService, revocationService)
    tenantAgent = createMock<TenantAgent>({
      didcomm: {
        credentials: {
          findAllByQuery: vi.fn(),
          findById: vi.fn(),
          getById: vi.fn(),
          offerCredential: vi.fn(),
          acceptOffer: vi.fn(),
        },
        connections: { findById: vi.fn() },
      } as any,
      modules: {
        anoncreds: { updateRevocationStatusList: vi.fn() },
      } as any,
    })
  })

  describe('find', () => {
    test('returns credential records by threadId', async () => {
      const mockRecords = [
        credentialExchangeRecordStub({ id: 'cred-1', state: 'offer-sent', createdAt: new Date() }),
        credentialExchangeRecordStub({ id: 'cred-2', state: 'done', createdAt: new Date() }),
      ]
      vi.mocked(tenantAgent.didcomm.credentials.findAllByQuery).mockResolvedValue(mockRecords)

      const result = await credentialService.find(tenantAgent, 'thread-1')

      expect(tenantAgent.didcomm.credentials.findAllByQuery).toHaveBeenCalledWith({ threadId: 'thread-1' })
      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('cred-1')
    })

    test('returns all credentials when no threadId', async () => {
      vi.mocked(tenantAgent.didcomm.credentials.findAllByQuery).mockResolvedValue([])

      const result = await credentialService.find(tenantAgent)

      expect(tenantAgent.didcomm.credentials.findAllByQuery).toHaveBeenCalledWith({ threadId: undefined })
      expect(result).toHaveLength(0)
    })
  })

  describe('types', () => {
    test('returns credential config from agent config', async () => {
      const result = await credentialService.types()

      expect(result).toBeDefined()
    })
  })

  describe('get', () => {
    test('returns credential record when found', async () => {
      const mockRecord = credentialExchangeRecordStub({ id: 'cred-1', state: 'done', createdAt: new Date() })
      vi.mocked(tenantAgent.didcomm.credentials.findById).mockResolvedValue(mockRecord)

      const result = await credentialService.get(tenantAgent, 'cred-1')

      expect(tenantAgent.didcomm.credentials.findById).toHaveBeenCalledWith('cred-1')
      expect(result.id).toBe('cred-1')
    })

    test('throws NotFoundException when not found', async () => {
      vi.mocked(tenantAgent.didcomm.credentials.findById).mockResolvedValue(null)

      await expect(credentialService.get(tenantAgent, 'missing')).rejects.toThrow(NotFoundException)
      expect(tenantAgent.didcomm.credentials.findById).toHaveBeenCalledWith('missing')
    })
  })

  describe('accept', () => {
    test('accepts credential offer', async () => {
      const mockRecord = credentialExchangeRecordStub({
        id: 'cred-1',
        state: DidCommCredentialState.OfferReceived,
        createdAt: new Date(),
      })
      vi.mocked(tenantAgent.didcomm.credentials.findById).mockResolvedValue(mockRecord)

      const acceptedRecord = credentialExchangeRecordStub({
        id: 'cred-1',
        state: DidCommCredentialState.Done,
        createdAt: new Date(),
      })
      vi.mocked(tenantAgent.didcomm.credentials.acceptOffer).mockResolvedValue(acceptedRecord)

      const result = await credentialService.accept(tenantAgent, 'cred-1')

      expect(tenantAgent.didcomm.credentials.findById).toHaveBeenCalledWith('cred-1')
      expect(tenantAgent.didcomm.credentials.acceptOffer).toHaveBeenCalledWith({ credentialExchangeRecordId: 'cred-1' })
      expect(result.id).toBe('cred-1')
    })

    test('throws NotFoundException when credential not found', async () => {
      vi.mocked(tenantAgent.didcomm.credentials.findById).mockResolvedValue(null)

      await expect(credentialService.accept(tenantAgent, 'missing')).rejects.toThrow(NotFoundException)
      expect(tenantAgent.didcomm.credentials.findById).toHaveBeenCalledWith('missing')
    })

    test('throws ConflictException when credential already accepted', async () => {
      const mockRecord = credentialExchangeRecordStub({
        id: 'cred-1',
        state: DidCommCredentialState.Done,
        createdAt: new Date(),
      })
      vi.mocked(tenantAgent.didcomm.credentials.findById).mockResolvedValue(mockRecord)

      await expect(credentialService.accept(tenantAgent, 'cred-1')).rejects.toThrow(ConflictException)
      expect(tenantAgent.didcomm.credentials.findById).toHaveBeenCalledWith('cred-1')
    })
  })

  describe('offer', () => {
    test('throws UnprocessableEntityException when connection not found', async () => {
      vi.mocked(tenantAgent.didcomm.connections.findById).mockResolvedValue(null)

      await expect(
        credentialService.offer(tenantAgent, {
          connectionId: 'bad-conn',
          credentialDefinitionId: 'creddef-1',
          attributes: [],
        } as any),
      ).rejects.toThrow(UnprocessableEntityException)
      expect(tenantAgent.didcomm.connections.findById).toHaveBeenCalledWith('bad-conn')
    })

    test('offers credential without revocation', async () => {
      vi.mocked(tenantAgent.didcomm.connections.findById).mockResolvedValue(connectionRecordStub({ id: 'conn-1' }))

      vi.mocked(anoncredsRegistryService.getCredentialDefinition).mockResolvedValue({
        credentialDefinitionId: 'creddef-1',
        credentialDefinition: {
          issuerId: 'issuer-1',
          schemaId: 'schema-1',
          value: { revocation: undefined },
        },
      } as any)

      vi.mocked(anoncredsRegistryService.getSchema).mockResolvedValue({
        schema: { attrNames: ['name', 'age'] },
      } as any)

      const mockCredRecord = credentialExchangeRecordStub({
        id: 'cred-new',
        state: 'offer-sent',
        createdAt: new Date(),
      })
      vi.mocked(tenantAgent.didcomm.credentials.offerCredential).mockResolvedValue(mockCredRecord)

      const result = await credentialService.offer(tenantAgent, {
        connectionId: 'conn-1',
        credentialDefinitionId: 'creddef-1',
        attributes: [
          { name: 'name', value: 'Alice' },
          { name: 'age', value: '30' },
        ],
      } as any)

      expect(tenantAgent.didcomm.connections.findById).toHaveBeenCalledWith('conn-1')
      expect(anoncredsRegistryService.getCredentialDefinition).toHaveBeenCalledWith(tenantAgent, 'creddef-1')
      expect(anoncredsRegistryService.getSchema).toHaveBeenCalledWith(tenantAgent, 'schema-1')
      expect(tenantAgent.didcomm.credentials.offerCredential).toHaveBeenCalledWith(
        expect.objectContaining({ connectionId: 'conn-1', protocolVersion: 'v2' }),
      )
      expect(result.id).toBe('cred-new')
      expect(revocationService.getOrCreate).not.toHaveBeenCalled()
    })

    test('offers credential with revocation and updates registry', async () => {
      vi.mocked(tenantAgent.didcomm.connections.findById).mockResolvedValue(connectionRecordStub({ id: 'conn-1' }))

      vi.mocked(anoncredsRegistryService.getCredentialDefinition).mockResolvedValue({
        credentialDefinitionId: 'creddef-1',
        credentialDefinition: {
          issuerId: 'issuer-1',
          schemaId: 'schema-1',
          value: { revocation: {} },
        },
      } as any)

      vi.mocked(revocationService.getOrCreate).mockResolvedValue({
        revocationRegistryDefinitionId: 'rev-reg-1',
        index: 4,
      } as any)

      vi.mocked(anoncredsRegistryService.getSchema).mockResolvedValue({
        schema: { attrNames: ['name'] },
      } as any)

      const mockCredRecord = credentialExchangeRecordStub({
        id: 'cred-rev',
        state: 'offer-sent',
        createdAt: new Date(),
      })
      vi.mocked(tenantAgent.didcomm.credentials.offerCredential).mockResolvedValue(mockCredRecord)

      const result = await credentialService.offer(tenantAgent, {
        connectionId: 'conn-1',
        credentialDefinitionId: 'creddef-1',
        attributes: [{ name: 'name', value: 'Alice' }],
      } as any)

      expect(tenantAgent.didcomm.connections.findById).toHaveBeenCalledWith('conn-1')
      expect(anoncredsRegistryService.getCredentialDefinition).toHaveBeenCalledWith(tenantAgent, 'creddef-1')
      expect(revocationService.getOrCreate).toHaveBeenCalledWith(tenantAgent, 'creddef-1', 'issuer-1')
      expect(anoncredsRegistryService.getSchema).toHaveBeenCalledWith(tenantAgent, 'schema-1')
      expect(tenantAgent.didcomm.credentials.offerCredential).toHaveBeenCalled()
      expect(result.id).toBe('cred-rev')
      expect(revocationService.update).toHaveBeenCalledWith(tenantAgent, 'rev-reg-1', { lastIndex: 5 })
    })
  })

  describe('revoke', () => {
    test('throws BadRequestException when credential does not support revocation', async () => {
      const mockCredential = {
        getTag: vi.fn().mockReturnValue(undefined),
      }
      vi.mocked(tenantAgent.didcomm.credentials.getById).mockResolvedValue(credentialExchangeRecordStub(mockCredential))

      await expect(credentialService.revoke(tenantAgent, 'cred-1')).rejects.toThrow(BadRequestException)
      expect(tenantAgent.didcomm.credentials.getById).toHaveBeenCalledWith('cred-1')
    })

    test('throws ConflictException when credential already revoked', async () => {
      const mockCredential = {
        getTag: vi.fn((tag: string) => {
          if (tag === 'anonCredsRevocationRegistryId') return 'rev-reg-1'
          if (tag === 'anonCredsCredentialRevocationId') return '5'
          return undefined
        }),
      }
      vi.mocked(tenantAgent.didcomm.credentials.getById).mockResolvedValue(credentialExchangeRecordStub(mockCredential))
      vi.mocked(revocationService.get).mockResolvedValue({ revocationStatusList: { 5: 1 } } as any)

      await expect(credentialService.revoke(tenantAgent, 'cred-1')).rejects.toThrow(ConflictException)
      expect(tenantAgent.didcomm.credentials.getById).toHaveBeenCalledWith('cred-1')
      expect(revocationService.get).toHaveBeenCalledWith(tenantAgent, 'rev-reg-1')
    })

    test('throws InternalServerErrorException when revocation index is not a number', async () => {
      const mockCredential = {
        getTag: vi.fn((tag: string) => {
          if (tag === 'anonCredsRevocationRegistryId') return 'rev-reg-1'
          if (tag === 'anonCredsCredentialRevocationId') return 'not-a-number'
          return undefined
        }),
      }
      vi.mocked(tenantAgent.didcomm.credentials.getById).mockResolvedValue(credentialExchangeRecordStub(mockCredential))

      await expect(credentialService.revoke(tenantAgent, 'cred-1')).rejects.toThrow(InternalServerErrorException)
      expect(tenantAgent.didcomm.credentials.getById).toHaveBeenCalledWith('cred-1')
    })

    test('revokes credential successfully', async () => {
      const mockCredential = {
        getTag: vi.fn((tag: string) => {
          if (tag === 'anonCredsRevocationRegistryId') return 'rev-reg-1'
          if (tag === 'anonCredsCredentialRevocationId') return '3'
          return undefined
        }),
      }
      vi.mocked(tenantAgent.didcomm.credentials.getById).mockResolvedValue(credentialExchangeRecordStub(mockCredential))
      vi.mocked(revocationService.get).mockResolvedValue({ revocationStatusList: { 3: 0 } } as any)
      vi.mocked(tenantAgent.modules.anoncreds.updateRevocationStatusList).mockResolvedValue({
        revocationStatusListState: { state: 'finished' },
      } as any)

      await expect(credentialService.revoke(tenantAgent, 'cred-1')).resolves.toBeUndefined()

      expect(tenantAgent.didcomm.credentials.getById).toHaveBeenCalledWith('cred-1')
      expect(revocationService.get).toHaveBeenCalledWith(tenantAgent, 'rev-reg-1')
      expect(tenantAgent.modules.anoncreds.updateRevocationStatusList).toHaveBeenCalledWith(
        expect.objectContaining({
          revocationStatusList: {
            revocationRegistryDefinitionId: 'rev-reg-1',
            revokedCredentialIndexes: [3],
          },
        }),
      )
    })

    test('throws InternalServerErrorException when revocation update fails', async () => {
      const mockCredential = {
        getTag: vi.fn((tag: string) => {
          if (tag === 'anonCredsRevocationRegistryId') return 'rev-reg-1'
          if (tag === 'anonCredsCredentialRevocationId') return '3'
          return undefined
        }),
      }
      vi.mocked(tenantAgent.didcomm.credentials.getById).mockResolvedValue(credentialExchangeRecordStub(mockCredential))
      vi.mocked(revocationService.get).mockResolvedValue({ revocationStatusList: { 3: 0 } } as any)
      vi.mocked(tenantAgent.modules.anoncreds.updateRevocationStatusList).mockResolvedValue({
        revocationStatusListState: { state: 'failed' },
      } as any)

      await expect(credentialService.revoke(tenantAgent, 'cred-1')).rejects.toThrow(InternalServerErrorException)
      expect(tenantAgent.didcomm.credentials.getById).toHaveBeenCalledWith('cred-1')
      expect(revocationService.get).toHaveBeenCalledWith(tenantAgent, 'rev-reg-1')
      expect(tenantAgent.modules.anoncreds.updateRevocationStatusList).toHaveBeenCalled()
    })
  })
})
