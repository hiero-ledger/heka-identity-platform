import { CredoError } from '@credo-ts/core'
import { DidCommProofState } from '@credo-ts/didcomm'
import { createMock } from '@golevelup/ts-vitest'
import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common'

import { TenantAgent } from 'common/agent'

import { connectionRecordStub, proofExchangeRecordStub } from '../../../test/helpers/mock-records'
import { AttrsPredsProofParamsDto, SchemaIdProofParamsDto, CredDefIdProofParamsDto } from '../dto/proof-params.dto'
import { ProofRequestFormat } from '../dto/proof-request.dto'
import { ProofService } from '../proof.service'

describe('ProofService', () => {
  let proofService: ProofService
  let tenantAgent: TenantAgent

  beforeEach(() => {
    proofService = new ProofService()
    tenantAgent = createMock<TenantAgent>({
      didcomm: {
        proofs: {
          findAllByQuery: vi.fn(),
          findById: vi.fn(),
          getFormatData: vi.fn(),
          requestProof: vi.fn(),
          acceptRequest: vi.fn(),
        },
        connections: { findById: vi.fn() },
      } as any,
      modules: {
        anoncreds: { getCredentialDefinition: vi.fn(), getSchema: vi.fn() },
      } as any,
    })
  })

  describe('find', () => {
    test('returns proof records by threadId', async () => {
      const mockRecords = [proofExchangeRecordStub({ id: 'proof-1', state: 'request-sent', createdAt: new Date() })]
      vi.mocked(tenantAgent.didcomm.proofs.findAllByQuery).mockResolvedValue(mockRecords)

      const result = await proofService.find(tenantAgent, 'thread-1')

      expect(tenantAgent.didcomm.proofs.findAllByQuery).toHaveBeenCalledWith({ threadId: 'thread-1' })
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('proof-1')
    })

    test('returns all proofs when no threadId', async () => {
      vi.mocked(tenantAgent.didcomm.proofs.findAllByQuery).mockResolvedValue([])

      const result = await proofService.find(tenantAgent)

      expect(tenantAgent.didcomm.proofs.findAllByQuery).toHaveBeenCalledWith({ threadId: undefined })
      expect(result).toHaveLength(0)
    })
  })

  describe('request', () => {
    test('throws UnprocessableEntityException when connection not found', async () => {
      vi.mocked(tenantAgent.didcomm.connections.findById).mockResolvedValue(null)

      await expect(
        proofService.request(tenantAgent, {
          connectionId: 'bad-conn',
          request: { format: 'DifPresentationExchange', presentationExchange: {} },
        } as any),
      ).rejects.toThrow(UnprocessableEntityException)
      expect(tenantAgent.didcomm.connections.findById).toHaveBeenCalledWith('bad-conn')
    })

    test('creates proof request with DifPresentationExchange format', async () => {
      vi.mocked(tenantAgent.didcomm.connections.findById).mockResolvedValue(connectionRecordStub({ id: 'conn-1' }))

      const mockProofRecord = proofExchangeRecordStub({ id: 'proof-1', state: 'request-sent', createdAt: new Date() })
      vi.mocked(tenantAgent.didcomm.proofs.requestProof).mockResolvedValue(mockProofRecord)

      const result = await proofService.request(tenantAgent, {
        connectionId: 'conn-1',
        request: {
          format: 'DifPresentationExchange',
          presentationExchange: { id: 'pex-1', input_descriptors: [] },
        },
      } as any)

      expect(tenantAgent.didcomm.proofs.requestProof).toHaveBeenCalledWith(
        expect.objectContaining({
          connectionId: 'conn-1',
          protocolVersion: 'v2',
        }),
      )
      expect(result.id).toBe('proof-1')
    })

    test('creates AnoncredsIndy request with SchemaIdProofParams', async () => {
      vi.mocked(tenantAgent.didcomm.connections.findById).mockResolvedValue(connectionRecordStub({ id: 'conn-1' }))
      vi.mocked(tenantAgent.modules.anoncreds.getSchema).mockResolvedValue({
        schema: { attrNames: ['name', 'age'] },
        resolutionMetadata: {},
      } as any)

      const mockProofRecord = proofExchangeRecordStub({ id: 'proof-2', state: 'request-sent', createdAt: new Date() })
      vi.mocked(tenantAgent.didcomm.proofs.requestProof).mockResolvedValue(mockProofRecord)

      const proofParams = new SchemaIdProofParamsDto()
      proofParams.schemaId = 'schema-1'

      const result = await proofService.request(tenantAgent, {
        connectionId: 'conn-1',
        request: {
          format: ProofRequestFormat.AnoncredsIndy,
          name: 'My Proof',
          proofParams,
        },
      } as any)

      expect(tenantAgent.modules.anoncreds.getSchema).toHaveBeenCalledWith('schema-1')
      expect(result.id).toBe('proof-2')
      expect(tenantAgent.didcomm.proofs.requestProof).toHaveBeenCalledWith(
        expect.objectContaining({
          proofFormats: expect.objectContaining({
            anoncreds: expect.objectContaining({
              name: 'My Proof',
              requested_attributes: {
                name: { name: 'name', restrictions: [{ schema_id: 'schema-1' }] },
                age: { name: 'age', restrictions: [{ schema_id: 'schema-1' }] },
              },
            }),
          }),
        }),
      )
    })

    test('creates AnoncredsIndy request with CredDefIdProofParams', async () => {
      vi.mocked(tenantAgent.didcomm.connections.findById).mockResolvedValue(connectionRecordStub({ id: 'conn-1' }))
      vi.mocked(tenantAgent.modules.anoncreds.getCredentialDefinition).mockResolvedValue({
        credentialDefinition: { schemaId: 'schema-1' },
        resolutionMetadata: {},
      } as any)
      vi.mocked(tenantAgent.modules.anoncreds.getSchema).mockResolvedValue({
        schema: { attrNames: ['email'] },
        resolutionMetadata: {},
      } as any)

      const mockProofRecord = proofExchangeRecordStub({ id: 'proof-3', state: 'request-sent', createdAt: new Date() })
      vi.mocked(tenantAgent.didcomm.proofs.requestProof).mockResolvedValue(mockProofRecord)

      const proofParams = new CredDefIdProofParamsDto()
      proofParams.credentialDefinitionId = 'creddef-1'

      const result = await proofService.request(tenantAgent, {
        connectionId: 'conn-1',
        request: {
          format: ProofRequestFormat.AnoncredsIndy,
          name: 'Cred Def Proof',
          proofParams,
        },
      } as any)

      expect(tenantAgent.modules.anoncreds.getCredentialDefinition).toHaveBeenCalledWith('creddef-1')
      expect(tenantAgent.modules.anoncreds.getSchema).toHaveBeenCalledWith('schema-1')
      expect(result.id).toBe('proof-3')
    })

    test('creates AnoncredsIndy request with AttrsPredsProofParams', async () => {
      vi.mocked(tenantAgent.didcomm.connections.findById).mockResolvedValue(connectionRecordStub({ id: 'conn-1' }))

      const mockProofRecord = proofExchangeRecordStub({ id: 'proof-4', state: 'request-sent', createdAt: new Date() })
      vi.mocked(tenantAgent.didcomm.proofs.requestProof).mockResolvedValue(mockProofRecord)

      const result = await proofService.request(tenantAgent, {
        connectionId: 'conn-1',
        request: {
          format: ProofRequestFormat.AnoncredsIndy,
          name: 'Attrs Proof',
          proofParams: new AttrsPredsProofParamsDto({
            attributes: [{ name: 'name', schemaId: 'schema-1' }],
            predicates: [{ name: 'age', type: '>=', value: 18, schemaId: 'schema-1' }],
          } as any),
        },
        requestNonRevokedProof: true,
      } as any)

      expect(result.id).toBe('proof-4')
      expect(tenantAgent.didcomm.proofs.requestProof).toHaveBeenCalledWith(
        expect.objectContaining({
          proofFormats: expect.objectContaining({
            anoncreds: expect.objectContaining({
              non_revoked: expect.objectContaining({ from: expect.any(Number), to: expect.any(Number) }),
            }),
          }),
        }),
      )
    })

    test('throws UnprocessableEntityException when schema resolution fails', async () => {
      vi.mocked(tenantAgent.didcomm.connections.findById).mockResolvedValue(connectionRecordStub({ id: 'conn-1' }))
      vi.mocked(tenantAgent.modules.anoncreds.getSchema).mockResolvedValue({
        schema: null,
        resolutionMetadata: { error: 'notFound' },
      } as any)

      const proofParams = new SchemaIdProofParamsDto()
      proofParams.schemaId = 'bad-schema'

      await expect(
        proofService.request(tenantAgent, {
          connectionId: 'conn-1',
          request: {
            format: ProofRequestFormat.AnoncredsIndy,
            name: 'Fail Proof',
            proofParams,
          },
        } as any),
      ).rejects.toThrow(UnprocessableEntityException)
      expect(tenantAgent.modules.anoncreds.getSchema).toHaveBeenCalledWith('bad-schema')
    })

    test('returns no revealedAttributes when format data has no presentation', async () => {
      vi.mocked(tenantAgent.didcomm.connections.findById).mockResolvedValue(connectionRecordStub({ id: 'conn-1' }))

      const mockRecord = proofExchangeRecordStub({ id: 'proof-5', state: 'done', createdAt: new Date() })
      vi.mocked(tenantAgent.didcomm.proofs.findById).mockResolvedValue(mockRecord)
      vi.mocked(tenantAgent.didcomm.proofs.getFormatData).mockResolvedValue({ presentation: {} } as any)

      const result = await proofService.get(tenantAgent, 'proof-5')
      expect(tenantAgent.didcomm.proofs.findById).toHaveBeenCalledWith('proof-5')
      expect(tenantAgent.didcomm.proofs.getFormatData).toHaveBeenCalledWith('proof-5')
      expect(result.revealedAttributes).toBeUndefined()
    })
  })

  describe('get', () => {
    test('returns proof record with anoncreds revealed attributes', async () => {
      const mockRecord = proofExchangeRecordStub({ id: 'proof-1', state: 'done', createdAt: new Date() })
      vi.mocked(tenantAgent.didcomm.proofs.findById).mockResolvedValue(mockRecord)
      vi.mocked(tenantAgent.didcomm.proofs.getFormatData).mockResolvedValue({
        presentation: {
          anoncreds: {
            requested_proof: {
              revealed_attrs: {
                name: { raw: 'Alice' },
                age: { raw: '30' },
              },
            },
          },
        },
      } as any)

      const result = await proofService.get(tenantAgent, 'proof-1')

      expect(tenantAgent.didcomm.proofs.findById).toHaveBeenCalledWith('proof-1')
      expect(tenantAgent.didcomm.proofs.getFormatData).toHaveBeenCalledWith('proof-1')
      expect(result.id).toBe('proof-1')
      expect(result.revealedAttributes).toHaveLength(2)
      expect(result.revealedAttributes![0]).toEqual({ name: 'name', value: 'Alice' })
      expect(result.revealedAttributes![1]).toEqual({ name: 'age', value: '30' })
    })

    test('returns proof record with presentationExchange revealed attributes', async () => {
      const mockRecord = proofExchangeRecordStub({ id: 'proof-2', state: 'done', createdAt: new Date() })
      vi.mocked(tenantAgent.didcomm.proofs.findById).mockResolvedValue(mockRecord)
      vi.mocked(tenantAgent.didcomm.proofs.getFormatData).mockResolvedValue({
        presentation: {
          presentationExchange: {
            verifiableCredential: [{ credentialSubject: { email: 'alice@example.com', role: 'admin' } }],
          },
        },
      } as any)

      const result = await proofService.get(tenantAgent, 'proof-2')

      expect(result.revealedAttributes).toHaveLength(2)
      expect(result.revealedAttributes).toContainEqual({ name: 'email', value: 'alice@example.com' })
      expect(result.revealedAttributes).toContainEqual({ name: 'role', value: 'admin' })
    })

    test('throws NotFoundException when proof not found', async () => {
      vi.mocked(tenantAgent.didcomm.proofs.findById).mockResolvedValue(null)

      await expect(proofService.get(tenantAgent, 'missing')).rejects.toThrow(NotFoundException)
      expect(tenantAgent.didcomm.proofs.findById).toHaveBeenCalledWith('missing')
    })
  })

  describe('present', () => {
    test('accepts proof request', async () => {
      const mockRecord = proofExchangeRecordStub({
        id: 'proof-1',
        state: DidCommProofState.RequestReceived,
        createdAt: new Date(),
      })
      vi.mocked(tenantAgent.didcomm.proofs.findById).mockResolvedValue(mockRecord)

      const acceptedRecord = proofExchangeRecordStub({
        id: 'proof-1',
        state: DidCommProofState.Done,
        createdAt: new Date(),
      })
      vi.mocked(tenantAgent.didcomm.proofs.acceptRequest).mockResolvedValue(acceptedRecord)

      const result = await proofService.present(tenantAgent, 'proof-1')

      expect(tenantAgent.didcomm.proofs.acceptRequest).toHaveBeenCalledWith({ proofExchangeRecordId: 'proof-1' })
      expect(result.id).toBe('proof-1')
    })

    test('throws NotFoundException when proof not found', async () => {
      vi.mocked(tenantAgent.didcomm.proofs.findById).mockResolvedValue(null)

      await expect(proofService.present(tenantAgent, 'missing')).rejects.toThrow(NotFoundException)
    })

    test('throws ConflictException when proof already presented', async () => {
      const mockRecord = proofExchangeRecordStub({
        id: 'proof-1',
        state: DidCommProofState.Done,
        createdAt: new Date(),
      })
      vi.mocked(tenantAgent.didcomm.proofs.findById).mockResolvedValue(mockRecord)

      await expect(proofService.present(tenantAgent, 'proof-1')).rejects.toThrow(ConflictException)
    })

    test('wraps CredoError for auto-select failure as UnprocessableEntityException', async () => {
      const mockRecord = proofExchangeRecordStub({
        id: 'proof-1',
        state: DidCommProofState.RequestReceived,
        createdAt: new Date(),
      })
      vi.mocked(tenantAgent.didcomm.proofs.findById).mockResolvedValue(mockRecord)
      vi.mocked(tenantAgent.didcomm.proofs.acceptRequest).mockRejectedValue(
        new CredoError('Unable to automatically select requested attributes'),
      )

      await expect(proofService.present(tenantAgent, 'proof-1')).rejects.toThrow(UnprocessableEntityException)
      expect(tenantAgent.didcomm.proofs.acceptRequest).toHaveBeenCalledWith({ proofExchangeRecordId: 'proof-1' })
    })

    test('rethrows non-CredoError errors', async () => {
      const mockRecord = proofExchangeRecordStub({
        id: 'proof-1',
        state: DidCommProofState.RequestReceived,
        createdAt: new Date(),
      })
      vi.mocked(tenantAgent.didcomm.proofs.findById).mockResolvedValue(mockRecord)
      vi.mocked(tenantAgent.didcomm.proofs.acceptRequest).mockRejectedValue(new Error('Unexpected'))

      await expect(proofService.present(tenantAgent, 'proof-1')).rejects.toThrow('Unexpected')
    })
  })
})
