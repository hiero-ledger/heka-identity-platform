import { createMock } from '@golevelup/ts-vitest'
import { BadRequestException } from '@nestjs/common'
import { when } from 'vitest-when'

import { TenantAgent } from 'common/agent'
import { AnoncredsRegistryService } from 'common/anoncreds-registry'
import { Logger } from 'common/logger'

import { SchemaService } from '../schema.service'

describe('SchemaService', () => {
  let schemaService: SchemaService
  let logger: Logger
  let anoncredsRegistryService: AnoncredsRegistryService
  let tenantAgent: TenantAgent

  beforeEach(() => {
    logger = createMock<Logger>()
    anoncredsRegistryService = createMock<AnoncredsRegistryService>()
    schemaService = new SchemaService(logger, anoncredsRegistryService)
    tenantAgent = createMock<TenantAgent>({
      modules: { anoncreds: { getCreatedSchemas: vi.fn() } } as any,
    })
  })

  describe('getCreated', () => {
    test('returns schemas filtered by method', async () => {
      const mockSchemas = [
        {
          schemaId: 'schema-1',
          schema: { issuerId: 'issuer-1', name: 'Test Schema', version: '1.0', attrNames: ['name', 'age'] },
        },
      ]
      when(tenantAgent.modules.anoncreds.getCreatedSchemas)
        .calledWith({ methodName: 'indy' })
        .thenResolve(mockSchemas as any)

      const result = await schemaService.getCreated(tenantAgent, { method: 'indy' })

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('schema-1')
      expect(result[0].name).toBe('Test Schema')
      expect(result[0].attrNames).toEqual(['name', 'age'])
    })

    test('returns empty array when no schemas found', async () => {
      when(tenantAgent.modules.anoncreds.getCreatedSchemas).calledWith({ methodName: undefined }).thenResolve([])

      const result = await schemaService.getCreated(tenantAgent, {})

      expect(result).toHaveLength(0)
    })
  })

  describe('get', () => {
    test('resolves schema by ID via registry service', async () => {
      when(anoncredsRegistryService.getSchema)
        .calledWith(tenantAgent, 'schema-1')
        .thenResolve({
          schemaId: 'schema-1',
          schema: { issuerId: 'issuer-1', name: 'Resolved Schema', version: '2.0', attrNames: ['email'] },
        } as any)

      const result = await schemaService.get(tenantAgent, 'schema-1')

      expect(result.id).toBe('schema-1')
      expect(result.name).toBe('Resolved Schema')
      expect(result.version).toBe('2.0')
    })
  })

  describe('create', () => {
    test('registers schema and returns DTO', async () => {
      when(anoncredsRegistryService.registerSchema)
        .calledWith(tenantAgent, expect.objectContaining({ attrNames: ['name', 'age'] }))
        .thenResolve({
          schemaId: 'new-schema-1',
          schema: { issuerId: 'issuer-1', name: 'New Schema', version: '1.0', attrNames: ['name', 'age'] },
        } as any)

      const result = await schemaService.create(tenantAgent, {
        issuerId: 'issuer-1',
        name: 'New Schema',
        version: '1.0',
        attrNames: ['name', 'age'],
      } as any)

      expect(result.id).toBe('new-schema-1')
      expect(result.name).toBe('New Schema')
    })

    test('throws BadRequestException when attrNames is missing', async () => {
      await expect(
        schemaService.create(tenantAgent, { issuerId: 'issuer-1', name: 'Bad', version: '1.0' } as any),
      ).rejects.toThrow(BadRequestException)
    })
  })
})
