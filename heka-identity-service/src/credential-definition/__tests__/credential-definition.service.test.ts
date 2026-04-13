import { createMock } from '@golevelup/ts-vitest'
import { when } from 'vitest-when'

import { TenantAgent } from 'common/agent'
import { AnoncredsRegistryService } from 'common/anoncreds-registry'
import { Logger } from 'common/logger'

import { CredentialDefinitionService } from '../credential-definition.service'

describe('CredentialDefinitionService', () => {
  let credDefService: CredentialDefinitionService
  let logger: Logger
  let anoncredsRegistryService: AnoncredsRegistryService
  let tenantAgent: TenantAgent

  beforeEach(() => {
    logger = createMock<Logger>()
    anoncredsRegistryService = createMock<AnoncredsRegistryService>()
    credDefService = new CredentialDefinitionService(logger, anoncredsRegistryService)
    tenantAgent = createMock<TenantAgent>({
      modules: { anoncreds: { getCreatedCredentialDefinitions: vi.fn() } } as any,
    })
  })

  describe('getCreated', () => {
    test('returns credential definitions filtered by issuerId and schemaId', async () => {
      const mockCredDefs = [
        {
          credentialDefinitionId: 'creddef-1',
          credentialDefinition: { issuerId: 'issuer-1', schemaId: 'schema-1', tag: 'default' },
        },
      ]
      when(tenantAgent.modules.anoncreds.getCreatedCredentialDefinitions)
        .calledWith({ issuerId: 'issuer-1', schemaId: 'schema-1' })
        .thenResolve(mockCredDefs as any)

      const result = await credDefService.getCreated(tenantAgent, 'issuer-1', 'schema-1')

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('creddef-1')
      expect(result[0].tag).toBe('default')
    })

    test('returns all credential definitions when no filters provided', async () => {
      const mockCredDefs = [
        {
          credentialDefinitionId: 'creddef-1',
          credentialDefinition: { issuerId: 'issuer-1', schemaId: 'schema-1', tag: 'tag1' },
        },
        {
          credentialDefinitionId: 'creddef-2',
          credentialDefinition: { issuerId: 'issuer-2', schemaId: 'schema-2', tag: 'tag2' },
        },
      ]
      when(tenantAgent.modules.anoncreds.getCreatedCredentialDefinitions)
        .calledWith({ issuerId: undefined, schemaId: undefined })
        .thenResolve(mockCredDefs as any)

      const result = await credDefService.getCreated(tenantAgent)

      expect(result).toHaveLength(2)
    })

    test('returns empty array when none found', async () => {
      when(tenantAgent.modules.anoncreds.getCreatedCredentialDefinitions)
        .calledWith({ issuerId: 'nonexistent', schemaId: undefined })
        .thenResolve([])

      const result = await credDefService.getCreated(tenantAgent, 'nonexistent')

      expect(result).toHaveLength(0)
    })
  })

  describe('create', () => {
    test('validates schema exists then registers credential definition', async () => {
      const req = { schemaId: 'schema-1', issuerId: 'issuer-1', tag: 'default' }

      when(anoncredsRegistryService.getSchema)
        .calledWith(tenantAgent, 'schema-1')
        .thenResolve({ schemaId: 'schema-1', schema: {} } as any)

      when(anoncredsRegistryService.registerCredentialDefinition)
        .calledWith(tenantAgent, req)
        .thenResolve({
          credentialDefinitionId: 'creddef-new',
          credentialDefinition: { issuerId: 'issuer-1', schemaId: 'schema-1', tag: 'default' },
        } as any)

      const result = await credDefService.create(tenantAgent, req as any)

      expect(result.id).toBe('creddef-new')
      expect(result.schemaId).toBe('schema-1')
      expect(result.tag).toBe('default')
      expect(anoncredsRegistryService.getSchema).toHaveBeenCalledWith(tenantAgent, 'schema-1')
    })

    test('propagates error when schema does not exist', async () => {
      when(anoncredsRegistryService.getSchema)
        .calledWith(tenantAgent, 'bad-schema')
        .thenReject(new Error('Schema not found'))

      await expect(credDefService.create(tenantAgent, { schemaId: 'bad-schema' } as any)).rejects.toThrow(
        'Schema not found',
      )
    })
  })

  describe('get', () => {
    test('resolves credential definition by ID', async () => {
      when(anoncredsRegistryService.getCredentialDefinition)
        .calledWith(tenantAgent, 'creddef-1')
        .thenResolve({
          credentialDefinitionId: 'creddef-1',
          credentialDefinition: { issuerId: 'issuer-1', schemaId: 'schema-1', tag: 'resolved' },
        } as any)

      const result = await credDefService.get(tenantAgent, 'creddef-1')

      expect(result.id).toBe('creddef-1')
      expect(result.tag).toBe('resolved')
    })
  })
})
