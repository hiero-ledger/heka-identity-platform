import { createMock } from '@golevelup/ts-vitest'
import { BadRequestException } from '@nestjs/common'

import { TenantAgent } from 'common/agent'
import { AnoncredsRegistryService } from 'common/anoncreds-registry'
import { Logger } from 'common/logger'

import { anonCredsSchemaStub, anonCredsSchemaRecordStub } from '../../../test/helpers/mock-records'
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
        anonCredsSchemaRecordStub({
          schemaId: 'schema-1',
          schema: anonCredsSchemaStub({
            issuerId: 'issuer-1',
            name: 'Test Schema',
            version: '1.0',
            attrNames: ['name', 'age'],
          }),
        }),
      ]
      vi.mocked(tenantAgent.modules.anoncreds.getCreatedSchemas).mockResolvedValue(mockSchemas)

      const result = await schemaService.getCreated(tenantAgent, { method: 'indy' })

      expect(tenantAgent.modules.anoncreds.getCreatedSchemas).toHaveBeenCalledWith({ methodName: 'indy' })
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('schema-1')
      expect(result[0].name).toBe('Test Schema')
      expect(result[0].attrNames).toEqual(['name', 'age'])
    })

    test('returns empty array when no schemas found', async () => {
      vi.mocked(tenantAgent.modules.anoncreds.getCreatedSchemas).mockResolvedValue([])

      const result = await schemaService.getCreated(tenantAgent, {})

      expect(tenantAgent.modules.anoncreds.getCreatedSchemas).toHaveBeenCalledWith({ methodName: undefined })
      expect(result).toHaveLength(0)
    })
  })

  describe('get', () => {
    test('resolves schema by ID via registry service', async () => {
      vi.mocked(anoncredsRegistryService.getSchema).mockResolvedValue({
        schemaId: 'schema-1',
        schema: anonCredsSchemaStub({
          issuerId: 'issuer-1',
          name: 'Resolved Schema',
          version: '2.0',
          attrNames: ['email'],
        }),
      })

      const result = await schemaService.get(tenantAgent, 'schema-1')

      expect(anoncredsRegistryService.getSchema).toHaveBeenCalledWith(tenantAgent, 'schema-1')
      expect(result.id).toBe('schema-1')
      expect(result.name).toBe('Resolved Schema')
      expect(result.version).toBe('2.0')
    })
  })

  describe('create', () => {
    test('registers schema and returns DTO', async () => {
      vi.mocked(anoncredsRegistryService.registerSchema).mockResolvedValue({
        schemaId: 'new-schema-1',
        schema: anonCredsSchemaStub({
          issuerId: 'issuer-1',
          name: 'New Schema',
          version: '1.0',
          attrNames: ['name', 'age'],
        }),
      })

      const result = await schemaService.create(tenantAgent, {
        issuerId: 'issuer-1',
        name: 'New Schema',
        version: '1.0',
        attrNames: ['name', 'age'],
      })

      expect(anoncredsRegistryService.registerSchema).toHaveBeenCalledWith(
        tenantAgent,
        expect.objectContaining({ attrNames: ['name', 'age'] }),
      )
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
