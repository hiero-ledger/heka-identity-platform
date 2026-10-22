import type { ConfigType } from '@nestjs/config'

import { DidDocumentRole, DidRecord } from '@credo-ts/core'
import { createMock } from '@golevelup/ts-vitest'
import { UnprocessableEntityException } from '@nestjs/common'

import { TenantAgent } from 'common/agent'
import AgentConfig from 'config/agent'

import { didRecordStub, didResolutionResultStub } from '../../../../test/helpers/mock-records'
import { AnoncredsRegistryService } from '../anoncreds-registry.service'

describe('AnoncredsRegistryService', () => {
  const issuerId = 'did:hedera:testnet:z6Mk_0.0.1'
  const schemaId = `${issuerId}/anoncreds/v0/SCHEMA/0.0.2`
  const credentialDefinitionId = `${issuerId}/anoncreds/v0/CLAIM_DEF/0.0.3`

  let service: AnoncredsRegistryService
  let tenantAgent: TenantAgent
  let didRepository: { update: ReturnType<typeof vi.fn> }

  const deactivatedRecord = () => didRecordStub({ did: issuerId, getTag: (name: string) => name === 'hekaDeactivated' })

  beforeEach(() => {
    service = new AnoncredsRegistryService({
      credentialsConfiguration: { Aries: { networks: ['hedera'] } },
    } as unknown as ConfigType<typeof AgentConfig>)
    didRepository = { update: vi.fn() }
    tenantAgent = createMock<TenantAgent>({
      dids: {
        getCreatedDids: vi.fn().mockResolvedValue([]),
        resolve: vi.fn().mockResolvedValue(didResolutionResultStub({ didDocument: { id: issuerId } })),
      },
      dependencyManager: { resolve: vi.fn().mockReturnValue(didRepository) },
      config: { logger: { warn: vi.fn() } },
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
          registerRevocationRegistryDefinition: vi.fn().mockResolvedValue({
            revocationRegistryDefinitionState: {
              state: 'finished',
              revocationRegistryDefinitionId: `${issuerId}/anoncreds/v0/REV_REG/0.0.4`,
              revocationRegistryDefinition: {},
            },
          }),
        },
      },
    })
  })

  describe('registerSchema', () => {
    const schema = { issuerId, name: 'Test', version: '1.0', attrNames: ['name'] }

    test('registers a schema for an active DID', async () => {
      const result = await service.registerSchema(tenantAgent, schema)

      expect(result.schemaId).toBe(schemaId)
      expect(tenantAgent.dids.getCreatedDids).toHaveBeenCalledWith({ did: issuerId })
      expect(tenantAgent.modules.anoncreds.registerSchema).toHaveBeenCalledWith({ schema, options: {} })
    })

    test('rejects a DID the wallet deactivated with 422 and writes nothing', async () => {
      vi.mocked(tenantAgent.dids.getCreatedDids).mockResolvedValue([deactivatedRecord()])

      const registration = service.registerSchema(tenantAgent, schema)

      await expect(registration).rejects.toThrow(UnprocessableEntityException)
      await expect(registration).rejects.toThrow(`DID is deactivated: ${issuerId}`)
      expect(tenantAgent.modules.anoncreds.registerSchema).not.toHaveBeenCalled()
    })

    test('asks the ledger, uncached and not from the wallet record', async () => {
      await service.registerSchema(tenantAgent, schema)

      expect(tenantAgent.dids.resolve).toHaveBeenCalledWith(issuerId, {
        useCache: false,
        useLocalCreatedDidRecord: false,
      })
    })

    test('rejects a DID deactivated on its ledger but not by the wallet with 422, and tags the wallet record', async () => {
      const record = new DidRecord({ did: issuerId, role: DidDocumentRole.Created })
      vi.mocked(tenantAgent.dids.getCreatedDids).mockResolvedValue([record])
      vi.mocked(tenantAgent.dids.resolve).mockResolvedValue(
        didResolutionResultStub({ didDocument: { id: issuerId }, didDocumentMetadata: { deactivated: true } }),
      )

      const registration = service.registerSchema(tenantAgent, schema)

      await expect(registration).rejects.toThrow(UnprocessableEntityException)
      await expect(registration).rejects.toThrow(`DID is deactivated: ${issuerId}`)
      expect(tenantAgent.modules.anoncreds.registerSchema).not.toHaveBeenCalled()
      expect(record.getTag('hekaDeactivated')).toBe(true)
      expect(didRepository.update).toHaveBeenCalledWith(tenantAgent.context, record)
    })

    test('rejects a DID deactivated on its ledger with 422 also when the wallet record cannot be tagged', async () => {
      vi.mocked(tenantAgent.dids.getCreatedDids).mockResolvedValue([
        new DidRecord({ did: issuerId, role: DidDocumentRole.Created }),
      ])
      vi.mocked(tenantAgent.dids.resolve).mockResolvedValue(
        didResolutionResultStub({ didDocumentMetadata: { deactivated: true } }),
      )
      didRepository.update.mockRejectedValue(new Error('storage unavailable'))

      await expect(service.registerSchema(tenantAgent, schema)).rejects.toThrow(UnprocessableEntityException)
      expect(tenantAgent.modules.anoncreds.registerSchema).not.toHaveBeenCalled()
      expect(tenantAgent.config.logger.warn).toHaveBeenCalledOnce()
    })

    test('falls back to the wallet tag when the resolver fails', async () => {
      vi.mocked(tenantAgent.dids.resolve).mockRejectedValue(new Error('resolver unavailable'))

      const result = await service.registerSchema(tenantAgent, schema)
      expect(result.schemaId).toBe(schemaId)
      expect(tenantAgent.config.logger.warn).toHaveBeenCalledOnce()

      vi.mocked(tenantAgent.dids.getCreatedDids).mockResolvedValue([deactivatedRecord()])
      await expect(service.registerSchema(tenantAgent, schema)).rejects.toThrow(UnprocessableEntityException)
    })

    test('falls back to the wallet tag when the ledger cannot resolve the DID', async () => {
      vi.mocked(tenantAgent.dids.resolve).mockResolvedValue(
        didResolutionResultStub({ didResolutionMetadata: { error: 'notFound' } }),
      )

      expect((await service.registerSchema(tenantAgent, schema)).schemaId).toBe(schemaId)

      vi.mocked(tenantAgent.dids.getCreatedDids).mockResolvedValue([deactivatedRecord()])
      await expect(service.registerSchema(tenantAgent, schema)).rejects.toThrow(UnprocessableEntityException)
    })

    test('skips the check when the caller already ran it', async () => {
      await service.registerSchema(tenantAgent, schema, { issuerDidChecked: true })

      expect(tenantAgent.dids.resolve).not.toHaveBeenCalled()
      expect(tenantAgent.dids.getCreatedDids).not.toHaveBeenCalled()
      expect(tenantAgent.modules.anoncreds.registerSchema).toHaveBeenCalledOnce()
    })
  })

  describe('registerCredentialDefinition', () => {
    const credentialDefinition = { issuerId, schemaId, tag: 'default' }

    test('registers a credential definition for an active DID', async () => {
      const result = await service.registerCredentialDefinition(tenantAgent, credentialDefinition)

      expect(result.credentialDefinitionId).toBe(credentialDefinitionId)
      expect(tenantAgent.dids.getCreatedDids).toHaveBeenCalledWith({ did: issuerId })
      expect(tenantAgent.modules.anoncreds.registerCredentialDefinition).toHaveBeenCalledOnce()
    })

    test('rejects a DID the wallet deactivated with 422 and writes nothing', async () => {
      vi.mocked(tenantAgent.dids.getCreatedDids).mockResolvedValue([deactivatedRecord()])

      const registration = service.registerCredentialDefinition(tenantAgent, credentialDefinition)

      await expect(registration).rejects.toThrow(UnprocessableEntityException)
      await expect(registration).rejects.toThrow(`DID is deactivated: ${issuerId}`)
      expect(tenantAgent.modules.anoncreds.registerCredentialDefinition).not.toHaveBeenCalled()
    })

    test('rejects a DID deactivated on its ledger but not by the wallet with 422', async () => {
      vi.mocked(tenantAgent.dids.resolve).mockResolvedValue(
        didResolutionResultStub({ didDocumentMetadata: { deactivated: true } }),
      )

      const registration = service.registerCredentialDefinition(tenantAgent, credentialDefinition)

      await expect(registration).rejects.toThrow(`DID is deactivated: ${issuerId}`)
      expect(tenantAgent.dids.resolve).toHaveBeenCalledWith(issuerId, {
        useCache: false,
        useLocalCreatedDidRecord: false,
      })
      expect(tenantAgent.modules.anoncreds.registerCredentialDefinition).not.toHaveBeenCalled()
    })

    test('skips the check when the caller already ran it', async () => {
      await service.registerCredentialDefinition(tenantAgent, credentialDefinition, { issuerDidChecked: true })

      expect(tenantAgent.dids.resolve).not.toHaveBeenCalled()
      expect(tenantAgent.modules.anoncreds.registerCredentialDefinition).toHaveBeenCalledOnce()
    })
  })

  describe('registerRevocationRegistryDefinition', () => {
    test('stays allowed for a deactivated DID (credentials issued before stay revocable)', async () => {
      vi.mocked(tenantAgent.dids.getCreatedDids).mockResolvedValue([deactivatedRecord()])

      await service.registerRevocationRegistryDefinition(tenantAgent, issuerId, credentialDefinitionId, 10)

      expect(tenantAgent.modules.anoncreds.registerRevocationRegistryDefinition).toHaveBeenCalledOnce()
    })
  })
})
