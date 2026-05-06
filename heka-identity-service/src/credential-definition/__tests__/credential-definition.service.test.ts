import { createMock } from '@golevelup/ts-vitest'

import { TenantAgent } from 'common/agent'
import { AnoncredsRegistryService } from 'common/anoncreds-registry'
import { Logger } from 'common/logger'

import {
  anonCredsCredentialDefinitionStub,
  anonCredsCredentialDefinitionRecordStub,
  anonCredsSchemaStub,
} from '../../../test/helpers/mock-records'
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
        anonCredsCredentialDefinitionRecordStub({
          credentialDefinitionId: 'creddef-1',
          credentialDefinition: anonCredsCredentialDefinitionStub({
            issuerId: 'issuer-1',
            schemaId: 'schema-1',
            tag: 'default',
          }),
        }),
      ]
      vi.mocked(tenantAgent.modules.anoncreds.getCreatedCredentialDefinitions).mockResolvedValue(mockCredDefs)

      const result = await credDefService.getCreated(tenantAgent, 'issuer-1', 'schema-1')

      expect(tenantAgent.modules.anoncreds.getCreatedCredentialDefinitions).toHaveBeenCalledWith({
        issuerId: 'issuer-1',
        schemaId: 'schema-1',
      })
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('creddef-1')
      expect(result[0].tag).toBe('default')
    })

    test('returns all credential definitions when no filters provided', async () => {
      const mockCredDefs = [
        anonCredsCredentialDefinitionRecordStub({
          credentialDefinitionId: 'creddef-1',
          credentialDefinition: anonCredsCredentialDefinitionStub({
            issuerId: 'issuer-1',
            schemaId: 'schema-1',
            tag: 'tag1',
          }),
        }),
        anonCredsCredentialDefinitionRecordStub({
          credentialDefinitionId: 'creddef-2',
          credentialDefinition: anonCredsCredentialDefinitionStub({
            issuerId: 'issuer-2',
            schemaId: 'schema-2',
            tag: 'tag2',
          }),
        }),
      ]
      vi.mocked(tenantAgent.modules.anoncreds.getCreatedCredentialDefinitions).mockResolvedValue(mockCredDefs)

      const result = await credDefService.getCreated(tenantAgent)

      expect(tenantAgent.modules.anoncreds.getCreatedCredentialDefinitions).toHaveBeenCalledWith({
        issuerId: undefined,
        schemaId: undefined,
      })
      expect(result).toHaveLength(2)
    })

    test('returns empty array when none found', async () => {
      vi.mocked(tenantAgent.modules.anoncreds.getCreatedCredentialDefinitions).mockResolvedValue([])

      const result = await credDefService.getCreated(tenantAgent, 'nonexistent')

      expect(tenantAgent.modules.anoncreds.getCreatedCredentialDefinitions).toHaveBeenCalledWith({
        issuerId: 'nonexistent',
        schemaId: undefined,
      })
      expect(result).toHaveLength(0)
    })
  })

  describe('create', () => {
    test('validates schema exists then registers credential definition', async () => {
      const req = { schemaId: 'schema-1', issuerId: 'issuer-1', tag: 'default' }

      vi.mocked(anoncredsRegistryService.getSchema).mockResolvedValue({
        schemaId: 'schema-1',
        schema: anonCredsSchemaStub(),
      })

      vi.mocked(anoncredsRegistryService.registerCredentialDefinition).mockResolvedValue({
        credentialDefinitionId: 'creddef-new',
        credentialDefinition: anonCredsCredentialDefinitionStub({
          issuerId: 'issuer-1',
          schemaId: 'schema-1',
          tag: 'default',
        }),
      })

      const result = await credDefService.create(tenantAgent, req)

      expect(anoncredsRegistryService.getSchema).toHaveBeenCalledWith(tenantAgent, 'schema-1')
      expect(anoncredsRegistryService.registerCredentialDefinition).toHaveBeenCalledWith(tenantAgent, req)
      expect(result.id).toBe('creddef-new')
      expect(result.schemaId).toBe('schema-1')
      expect(result.tag).toBe('default')
    })

    test('propagates error when schema does not exist', async () => {
      vi.mocked(anoncredsRegistryService.getSchema).mockRejectedValue(new Error('Schema not found'))

      await expect(credDefService.create(tenantAgent, { schemaId: 'bad-schema' } as any)).rejects.toThrow(
        'Schema not found',
      )
      expect(anoncredsRegistryService.getSchema).toHaveBeenCalledWith(tenantAgent, 'bad-schema')
    })
  })

  describe('get', () => {
    test('resolves credential definition by ID', async () => {
      vi.mocked(anoncredsRegistryService.getCredentialDefinition).mockResolvedValue({
        credentialDefinitionId: 'creddef-1',
        credentialDefinition: anonCredsCredentialDefinitionStub({
          issuerId: 'issuer-1',
          schemaId: 'schema-1',
          tag: 'resolved',
        }),
      })

      const result = await credDefService.get(tenantAgent, 'creddef-1')

      expect(anoncredsRegistryService.getCredentialDefinition).toHaveBeenCalledWith(tenantAgent, 'creddef-1')
      expect(result.id).toBe('creddef-1')
      expect(result.tag).toBe('resolved')
    })
  })
})
