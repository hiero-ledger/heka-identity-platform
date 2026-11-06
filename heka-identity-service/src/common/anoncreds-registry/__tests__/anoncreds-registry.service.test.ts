import type { ConfigType } from '@nestjs/config'

import { createMock } from '@golevelup/ts-vitest'

import { TenantAgent } from 'common/agent'
import AgentConfig from 'config/agent'

import { AnoncredsRegistryService } from '../anoncreds-registry.service'

describe('AnoncredsRegistryService', () => {
  const issuerId = 'did:hedera:testnet:z6Mk_0.0.1'
  const schemaId = `${issuerId}/anoncreds/v0/SCHEMA/0.0.2`
  const credentialDefinitionId = `${issuerId}/anoncreds/v0/CLAIM_DEF/0.0.3`

  let service: AnoncredsRegistryService
  let tenantAgent: TenantAgent

  beforeEach(() => {
    service = new AnoncredsRegistryService({
      credentialsConfiguration: { Aries: { networks: ['hedera'] } },
    } as unknown as ConfigType<typeof AgentConfig>)
    tenantAgent = createMock<TenantAgent>({
      dids: { getCreatedDids: vi.fn(), resolve: vi.fn() },
      modules: {
        anoncreds: {
          registerSchema: vi.fn().mockResolvedValue({
            schemaState: {
              state: 'finished',
              schemaId,
              schema: { issuerId, name: 'Test', version: '1.0', attrNames: ['name'] },
            },
          }),
          registerCredentialDefinition: vi.fn().mockResolvedValue({
            credentialDefinitionState: {
              state: 'finished',
              credentialDefinitionId,
              credentialDefinition: { issuerId, schemaId, tag: 'default', type: 'CL', value: {} },
            },
          }),
        },
      },
    })
  })

  // The issuer DID is checked by the callers (`assertDidActiveOnLedger`), not here
  test('registers a schema without reading the issuer DID', async () => {
    const schema = { issuerId, name: 'Test', version: '1.0', attrNames: ['name'] }

    const result = await service.registerSchema(tenantAgent, schema)

    expect(result.schemaId).toBe(schemaId)
    expect(tenantAgent.modules.anoncreds.registerSchema).toHaveBeenCalledWith({ schema, options: {} })
    expect(tenantAgent.dids.resolve).not.toHaveBeenCalled()
    expect(tenantAgent.dids.getCreatedDids).not.toHaveBeenCalled()
  })

  test('registers a credential definition without reading the issuer DID', async () => {
    const result = await service.registerCredentialDefinition(tenantAgent, { issuerId, schemaId, tag: 'default' })

    expect(result.credentialDefinitionId).toBe(credentialDefinitionId)
    expect(tenantAgent.modules.anoncreds.registerCredentialDefinition).toHaveBeenCalledOnce()
    expect(tenantAgent.dids.resolve).not.toHaveBeenCalled()
  })
})
