import { createMock } from '@golevelup/ts-vitest'
import { DidCommCredentialState } from '@credo-ts/didcomm'
import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { when } from 'vitest-when'

import { TenantAgent } from 'common/agent'
import { AnoncredsRegistryService } from 'common/anoncreds-registry'
import { Logger } from 'common/logger'
import { RevocationRegistryService } from 'revocation/revocation-registry/revocation-registry.service'

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
        credentials: { findAllByQuery: vi.fn(), findById: vi.fn(), getById: vi.fn(), offerCredential: vi.fn(), acceptOffer: vi.fn() },
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
        { id: 'cred-1', state: 'offer-sent', createdAt: new Date() },
        { id: 'cred-2', state: 'done', createdAt: new Date() },
      ]
      when(tenantAgent.didcomm.credentials.findAllByQuery)
        .calledWith({ threadId: 'thread-1' })
        .thenResolve(mockRecords as any)

      const result = await credentialService.find(tenantAgent, 'thread-1')

      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('cred-1')
    })

    test('returns all credentials when no threadId', async () => {
      when(tenantAgent.didcomm.credentials.findAllByQuery)
        .calledWith({ threadId: undefined })
        .thenResolve([])

      const result = await credentialService.find(tenantAgent)

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
      const mockRecord = { id: 'cred-1', state: 'done', createdAt: new Date() }
      when(tenantAgent.didcomm.credentials.findById).calledWith('cred-1').thenResolve(mockRecord as any)

      const result = await credentialService.get(tenantAgent, 'cred-1')

      expect(result.id).toBe('cred-1')
    })

    test('throws NotFoundException when not found', async () => {
      when(tenantAgent.didcomm.credentials.findById).calledWith('missing').thenResolve(null as any)

      await expect(credentialService.get(tenantAgent, 'missing')).rejects.toThrow(NotFoundException)
    })
  })

  describe('accept', () => {
    test('accepts credential offer', async () => {
      const mockRecord = { id: 'cred-1', state: DidCommCredentialState.OfferReceived, createdAt: new Date() }
      when(tenantAgent.didcomm.credentials.findById).calledWith('cred-1').thenResolve(mockRecord as any)

      const acceptedRecord = { id: 'cred-1', state: DidCommCredentialState.Done, createdAt: new Date() }
      when(tenantAgent.didcomm.credentials.acceptOffer)
        .calledWith({ credentialExchangeRecordId: 'cred-1' })
        .thenResolve(acceptedRecord as any)

      const result = await credentialService.accept(tenantAgent, 'cred-1')

      expect(result.id).toBe('cred-1')
    })

    test('throws NotFoundException when credential not found', async () => {
      when(tenantAgent.didcomm.credentials.findById).calledWith('missing').thenResolve(null as any)

      await expect(credentialService.accept(tenantAgent, 'missing')).rejects.toThrow(NotFoundException)
    })

    test('throws ConflictException when credential already accepted', async () => {
      const mockRecord = { id: 'cred-1', state: DidCommCredentialState.Done, createdAt: new Date() }
      when(tenantAgent.didcomm.credentials.findById).calledWith('cred-1').thenResolve(mockRecord as any)

      await expect(credentialService.accept(tenantAgent, 'cred-1')).rejects.toThrow(ConflictException)
    })
  })

  describe('offer', () => {
    test('throws UnprocessableEntityException when connection not found', async () => {
      when(tenantAgent.didcomm.connections.findById).calledWith('bad-conn').thenResolve(null as any)

      await expect(
        credentialService.offer(tenantAgent, {
          connectionId: 'bad-conn',
          credentialDefinitionId: 'creddef-1',
          attributes: [],
        } as any),
      ).rejects.toThrow(UnprocessableEntityException)
    })

    test('offers credential without revocation', async () => {
      when(tenantAgent.didcomm.connections.findById)
        .calledWith('conn-1')
        .thenResolve({ id: 'conn-1' } as any)

      when(anoncredsRegistryService.getCredentialDefinition)
        .calledWith(tenantAgent, 'creddef-1')
        .thenResolve({
          credentialDefinitionId: 'creddef-1',
          credentialDefinition: {
            issuerId: 'issuer-1',
            schemaId: 'schema-1',
            value: { revocation: undefined },
          },
        } as any)

      when(anoncredsRegistryService.getSchema)
        .calledWith(tenantAgent, 'schema-1')
        .thenResolve({
          schema: { attrNames: ['name', 'age'] },
        } as any)

      const mockCredRecord = { id: 'cred-new', state: 'offer-sent', createdAt: new Date() }
      when(tenantAgent.didcomm.credentials.offerCredential)
        .calledWith(expect.objectContaining({ connectionId: 'conn-1', protocolVersion: 'v2' }))
        .thenResolve(mockCredRecord as any)

      const result = await credentialService.offer(tenantAgent, {
        connectionId: 'conn-1',
        credentialDefinitionId: 'creddef-1',
        attributes: [{ name: 'name', value: 'Alice' }, { name: 'age', value: '30' }],
      } as any)

      expect(result.id).toBe('cred-new')
      expect(revocationService.getOrCreate).not.toHaveBeenCalled()
    })

    test('offers credential with revocation and updates registry', async () => {
      when(tenantAgent.didcomm.connections.findById)
        .calledWith('conn-1')
        .thenResolve({ id: 'conn-1' } as any)

      when(anoncredsRegistryService.getCredentialDefinition)
        .calledWith(tenantAgent, 'creddef-1')
        .thenResolve({
          credentialDefinitionId: 'creddef-1',
          credentialDefinition: {
            issuerId: 'issuer-1',
            schemaId: 'schema-1',
            value: { revocation: {} },
          },
        } as any)

      when(revocationService.getOrCreate)
        .calledWith(tenantAgent, 'creddef-1', 'issuer-1')
        .thenResolve({
          revocationRegistryDefinitionId: 'rev-reg-1',
          index: 4,
        } as any)

      when(anoncredsRegistryService.getSchema)
        .calledWith(tenantAgent, 'schema-1')
        .thenResolve({
          schema: { attrNames: ['name'] },
        } as any)

      const mockCredRecord = { id: 'cred-rev', state: 'offer-sent', createdAt: new Date() }
      when(tenantAgent.didcomm.credentials.offerCredential)
        .calledWith(expect.anything())
        .thenResolve(mockCredRecord as any)

      const result = await credentialService.offer(tenantAgent, {
        connectionId: 'conn-1',
        credentialDefinitionId: 'creddef-1',
        attributes: [{ name: 'name', value: 'Alice' }],
      } as any)

      expect(result.id).toBe('cred-rev')
      expect(revocationService.update).toHaveBeenCalledWith(tenantAgent, 'rev-reg-1', { lastIndex: 5 })
    })
  })

  describe('revoke', () => {
    test('throws BadRequestException when credential does not support revocation', async () => {
      const mockCredential = {
        getTag: vi.fn().mockReturnValue(undefined),
      }
      when(tenantAgent.didcomm.credentials.getById).calledWith('cred-1').thenResolve(mockCredential as any)

      await expect(credentialService.revoke(tenantAgent, 'cred-1')).rejects.toThrow(BadRequestException)
    })

    test('throws ConflictException when credential already revoked', async () => {
      const mockCredential = {
        getTag: vi.fn((tag: string) => {
          if (tag === 'anonCredsRevocationRegistryId') return 'rev-reg-1'
          if (tag === 'anonCredsCredentialRevocationId') return '5'
          return undefined
        }),
      }
      when(tenantAgent.didcomm.credentials.getById).calledWith('cred-1').thenResolve(mockCredential as any)
      when(revocationService.get)
        .calledWith(tenantAgent, 'rev-reg-1')
        .thenResolve({ revocationStatusList: { 5: 1 } } as any)

      await expect(credentialService.revoke(tenantAgent, 'cred-1')).rejects.toThrow(ConflictException)
    })

    test('throws InternalServerErrorException when revocation index is not a number', async () => {
      const mockCredential = {
        getTag: vi.fn((tag: string) => {
          if (tag === 'anonCredsRevocationRegistryId') return 'rev-reg-1'
          if (tag === 'anonCredsCredentialRevocationId') return 'not-a-number'
          return undefined
        }),
      }
      when(tenantAgent.didcomm.credentials.getById).calledWith('cred-1').thenResolve(mockCredential as any)

      await expect(credentialService.revoke(tenantAgent, 'cred-1')).rejects.toThrow(InternalServerErrorException)
    })

    test('revokes credential successfully', async () => {
      const mockCredential = {
        getTag: vi.fn((tag: string) => {
          if (tag === 'anonCredsRevocationRegistryId') return 'rev-reg-1'
          if (tag === 'anonCredsCredentialRevocationId') return '3'
          return undefined
        }),
      }
      when(tenantAgent.didcomm.credentials.getById).calledWith('cred-1').thenResolve(mockCredential as any)
      when(revocationService.get)
        .calledWith(tenantAgent, 'rev-reg-1')
        .thenResolve({ revocationStatusList: { 3: 0 } } as any)
      when(tenantAgent.modules.anoncreds.updateRevocationStatusList)
        .calledWith(expect.objectContaining({
          revocationStatusList: {
            revocationRegistryDefinitionId: 'rev-reg-1',
            revokedCredentialIndexes: [3],
          },
        }))
        .thenResolve({ revocationStatusListState: { state: 'finished' } } as any)

      await expect(credentialService.revoke(tenantAgent, 'cred-1')).resolves.toBeUndefined()
    })

    test('throws InternalServerErrorException when revocation update fails', async () => {
      const mockCredential = {
        getTag: vi.fn((tag: string) => {
          if (tag === 'anonCredsRevocationRegistryId') return 'rev-reg-1'
          if (tag === 'anonCredsCredentialRevocationId') return '3'
          return undefined
        }),
      }
      when(tenantAgent.didcomm.credentials.getById).calledWith('cred-1').thenResolve(mockCredential as any)
      when(revocationService.get)
        .calledWith(tenantAgent, 'rev-reg-1')
        .thenResolve({ revocationStatusList: { 3: 0 } } as any)
      when(tenantAgent.modules.anoncreds.updateRevocationStatusList)
        .calledWith(expect.anything())
        .thenResolve({ revocationStatusListState: { state: 'failed' } } as any)

      await expect(credentialService.revoke(tenantAgent, 'cred-1')).rejects.toThrow(InternalServerErrorException)
    })
  })
})
