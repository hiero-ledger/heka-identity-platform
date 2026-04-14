import { createMock } from '@golevelup/ts-vitest'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { when } from 'vitest-when'

import { TenantAgent } from '../../../common/agent'
import { AnoncredsRegistryService } from '../../../common/anoncreds-registry'
import { defaultMaximumCredentialNumber } from '../dto/create-revocation-registry.dto'
import { RevocationRegistryService } from '../revocation-registry.service'

describe('RevocationRegistryService', () => {
  let service: RevocationRegistryService
  let anoncredsRegistryService: AnoncredsRegistryService
  let tenantAgent: TenantAgent

  beforeEach(() => {
    anoncredsRegistryService = createMock<AnoncredsRegistryService>()
    tenantAgent = createMock<TenantAgent>({
      modules: {
        anoncreds: {
          registerRevocationStatusList: vi.fn(),
          getRevocationStatusList: vi.fn(),
        },
      } as any,
      dids: {
        getCreatedDids: vi.fn(),
      } as any,
      genericRecords: {
        save: vi.fn(),
        findAllByQuery: vi.fn(),
        update: vi.fn(),
      } as any,
    })

    service = new RevocationRegistryService(anoncredsRegistryService)
  })

  describe('create', () => {
    const issuerId = 'did:indy:test:issuer123'
    const credentialDefinitionId = 'did:indy:test:creddef123'
    const revocationRegistryDefinitionId = 'did:indy:test:revregdef123'

    test('should create a revocation registry with default maximumCredentialNumber', async () => {
      when(tenantAgent.dids.getCreatedDids)
        .calledWith({ did: issuerId })
        .thenResolve([{ did: issuerId }] as any)

      when(anoncredsRegistryService.registerRevocationRegistryDefinition)
        .calledWith(tenantAgent, issuerId, credentialDefinitionId, defaultMaximumCredentialNumber)
        .thenResolve({
          revocationRegistryDefinitionId,
          revocationRegistryDefinition: {} as any,
        })

      const result = await service.create(tenantAgent, {
        credentialDefinitionId,
        issuerId,
      })

      expect(result.revocationRegistryDefinitionId).toBe(revocationRegistryDefinitionId)
      expect(result.index).toBe(0)
      expect(result.maximumCredentialNumber).toBe(defaultMaximumCredentialNumber)
      expect(tenantAgent.modules.anoncreds.registerRevocationStatusList).toHaveBeenCalledWith({
        revocationStatusList: {
          revocationRegistryDefinitionId,
          issuerId,
        },
        options: {},
      })
      expect(tenantAgent.genericRecords.save).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: {
            revocationRegistryDefinitionId,
            credentialDefinitionId,
          },
          content: {
            revocationRegistryDefinitionId,
            credentialDefinitionId,
            index: 0,
            maximumCredentialNumber: defaultMaximumCredentialNumber,
          },
        }),
      )
    })

    test('should create a revocation registry with custom maximumCredentialNumber', async () => {
      const customMax = 500

      when(tenantAgent.dids.getCreatedDids)
        .calledWith({ did: issuerId })
        .thenResolve([{ did: issuerId }] as any)

      when(anoncredsRegistryService.registerRevocationRegistryDefinition)
        .calledWith(tenantAgent, issuerId, credentialDefinitionId, customMax)
        .thenResolve({
          revocationRegistryDefinitionId,
          revocationRegistryDefinition: {} as any,
        })

      const result = await service.create(tenantAgent, {
        credentialDefinitionId,
        issuerId,
        maximumCredentialNumber: customMax,
      })

      expect(result.maximumCredentialNumber).toBe(customMax)
    })

    test('should throw NotFoundException when DID is not found', async () => {
      when(tenantAgent.dids.getCreatedDids).calledWith({ did: issuerId }).thenResolve([])

      await expect(service.create(tenantAgent, { credentialDefinitionId, issuerId })).rejects.toThrow(NotFoundException)
    })
  })

  describe('get', () => {
    const id = 'did:indy:test:revregdef123'

    test('should return revocation status list with provided timestamp', async () => {
      const timestamp = '1700000000'
      const revocationList = [0, 1, 0, 0]

      when(tenantAgent.modules.anoncreds.getRevocationStatusList as any)
        .calledWith(id, 1700000000)
        .thenResolve({
          revocationStatusList: { revocationList },
        })

      const result = await service.get(tenantAgent, id, timestamp)

      expect(result.timestamp).toBe(1700000000)
      expect(result.revocationStatusList).toEqual(revocationList)
    })

    test('should use current timestamp when none is provided', async () => {
      const revocationList = [0, 0, 0]

      when(tenantAgent.modules.anoncreds.getRevocationStatusList as any)
        .calledWith(id, expect.any(Number))
        .thenResolve({
          revocationStatusList: { revocationList },
        })

      const result = await service.get(tenantAgent, id)

      expect(result.timestamp).toBeGreaterThan(0)
      expect(result.revocationStatusList).toEqual(revocationList)
    })

    test('should throw BadRequestException for invalid timestamp', async () => {
      await expect(service.get(tenantAgent, id, 'not-a-number')).rejects.toThrow(BadRequestException)
    })

    test('should throw NotFoundException when revocation status list is not found', async () => {
      when(tenantAgent.modules.anoncreds.getRevocationStatusList as any)
        .calledWith(id, expect.any(Number))
        .thenResolve({ revocationStatusList: null })

      await expect(service.get(tenantAgent, id, '1700000000')).rejects.toThrow(NotFoundException)
    })
  })

  describe('find', () => {
    test('should return mapped revocation registries', async () => {
      const credentialDefinitionId = 'did:indy:test:creddef123'
      const records = [
        {
          content: {
            revocationRegistryDefinitionId: 'revregdef1',
            index: 5,
            maximumCredentialNumber: 100,
          },
        },
        {
          content: {
            revocationRegistryDefinitionId: 'revregdef2',
            index: 10,
            maximumCredentialNumber: 200,
          },
        },
      ]

      when(tenantAgent.genericRecords.findAllByQuery)
        .calledWith({ credentialDefinitionId })
        .thenResolve(records as any)

      const result = await service.find(tenantAgent, credentialDefinitionId)

      expect(result).toHaveLength(2)
      expect(result[0].revocationRegistryDefinitionId).toBe('revregdef1')
      expect(result[0].index).toBe(5)
      expect(result[1].revocationRegistryDefinitionId).toBe('revregdef2')
      expect(result[1].maximumCredentialNumber).toBe(200)
    })

    test('should return empty array when no records found', async () => {
      when(tenantAgent.genericRecords.findAllByQuery).calledWith({ credentialDefinitionId: undefined }).thenResolve([])

      const result = await service.find(tenantAgent)

      expect(result).toEqual([])
    })
  })

  describe('update', () => {
    const revocationRegistryDefinitionId = 'did:indy:test:revregdef123'

    test('should update the index of the revocation registry record', async () => {
      const record = {
        content: { index: 0 },
      }

      when(tenantAgent.genericRecords.findAllByQuery)
        .calledWith({ revocationRegistryDefinitionId })
        .thenResolve([record] as any)

      await service.update(tenantAgent, revocationRegistryDefinitionId, { lastIndex: 5 })

      expect(record.content.index).toBe(5)
      expect(tenantAgent.genericRecords.update).toHaveBeenCalledWith(record)
    })

    test('should throw BadRequestException when revocation registry not found', async () => {
      when(tenantAgent.genericRecords.findAllByQuery).calledWith({ revocationRegistryDefinitionId }).thenResolve([])

      await expect(service.update(tenantAgent, revocationRegistryDefinitionId, { lastIndex: 5 })).rejects.toThrow(
        BadRequestException,
      )
    })
  })

  describe('getOrCreate', () => {
    const credentialDefinitionId = 'did:indy:test:creddef123'
    const issuerId = 'did:indy:test:issuer123'

    test('should return existing registry when one has available capacity', async () => {
      const records = [
        {
          content: {
            revocationRegistryDefinitionId: 'revregdef1',
            index: 50,
            maximumCredentialNumber: 100,
          },
        },
      ]

      when(tenantAgent.genericRecords.findAllByQuery)
        .calledWith({ credentialDefinitionId })
        .thenResolve(records as any)

      const result = await service.getOrCreate(tenantAgent, credentialDefinitionId, issuerId)

      expect(result.revocationRegistryDefinitionId).toBe('revregdef1')
      expect(result.index).toBe(50)
    })

    test('should create new registry when all existing ones are full', async () => {
      const fullRecords = [
        {
          content: {
            revocationRegistryDefinitionId: 'revregdef1',
            index: 100,
            maximumCredentialNumber: 100,
          },
        },
      ]

      when(tenantAgent.genericRecords.findAllByQuery)
        .calledWith({ credentialDefinitionId })
        .thenResolve(fullRecords as any)

      // Setup for create path
      when(tenantAgent.dids.getCreatedDids)
        .calledWith({ did: issuerId })
        .thenResolve([{ did: issuerId }] as any)

      when(anoncredsRegistryService.registerRevocationRegistryDefinition)
        .calledWith(tenantAgent, issuerId, credentialDefinitionId, defaultMaximumCredentialNumber)
        .thenResolve({
          revocationRegistryDefinitionId: 'new-revregdef',
          revocationRegistryDefinition: {} as any,
        })

      const result = await service.getOrCreate(tenantAgent, credentialDefinitionId, issuerId)

      expect(result.revocationRegistryDefinitionId).toBe('new-revregdef')
      expect(result.index).toBe(0)
    })

    test('should create new registry when no existing registries found', async () => {
      when(tenantAgent.genericRecords.findAllByQuery).calledWith({ credentialDefinitionId }).thenResolve([])

      when(tenantAgent.dids.getCreatedDids)
        .calledWith({ did: issuerId })
        .thenResolve([{ did: issuerId }] as any)

      when(anoncredsRegistryService.registerRevocationRegistryDefinition)
        .calledWith(tenantAgent, issuerId, credentialDefinitionId, defaultMaximumCredentialNumber)
        .thenResolve({
          revocationRegistryDefinitionId: 'new-revregdef',
          revocationRegistryDefinition: {} as any,
        })

      const result = await service.getOrCreate(tenantAgent, credentialDefinitionId, issuerId)

      expect(result.revocationRegistryDefinitionId).toBe('new-revregdef')
    })
  })
})
