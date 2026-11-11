import { AnonCredsCredentialMetadataKey } from '@credo-ts/anoncreds'
import { DidCommCredentialRole, DidCommCredentialState, DidCommMessageRepository } from '@credo-ts/didcomm'
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
import { AriesCredentialFormat } from 'common/types'
import { RevocationRegistryService } from 'revocation/revocation-registry/revocation-registry.service'

import {
  anonCredsOffer,
  dataIntegrityAnonCredsOffer,
  offerMessageRecord,
} from '../../../test/helpers/credential-offer-messages'
import { connectionRecordStub, credentialExchangeRecordStub } from '../../../test/helpers/mock-records'
import { CredentialService } from '../credential.service'

/** The offer-message query of `CredentialService`, as far as the tests read it */
interface OfferQuery {
  $or: Array<{ associatedRecordId: string }>
}

interface RecordOptions {
  id: string
  role?: DidCommCredentialRole
  state?: DidCommCredentialState
  registryId?: string
  revocationIndex?: string
  credentialDefinitionId?: string
  connectionId?: string
}

/** Credential exchange record stub with the tag and metadata accessors the DTO reads */
const credentialRecord = ({
  id,
  role = DidCommCredentialRole.Issuer,
  state = DidCommCredentialState.Done,
  registryId,
  revocationIndex,
  credentialDefinitionId,
  connectionId,
}: RecordOptions) =>
  credentialExchangeRecordStub({
    id,
    connectionId,
    role,
    state,
    threadId: `thread-${id}`,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    credentialAttributes: [{ name: 'secret', value: 'attribute-value' }],
    getTag: vi.fn((tag: string) => {
      if (tag === 'anonCredsRevocationRegistryId') return registryId
      if (tag === 'anonCredsCredentialRevocationId') return revocationIndex
      return undefined
    }),
    metadata: {
      get: vi.fn((key: string) =>
        key === AnonCredsCredentialMetadataKey && credentialDefinitionId ? { credentialDefinitionId } : undefined,
      ),
    },
  })

describe('CredentialService', () => {
  let credentialService: CredentialService
  let logger: Logger
  let anoncredsRegistryService: AnoncredsRegistryService
  let revocationService: RevocationRegistryService
  let tenantAgent: TenantAgent
  let messageRepository: { findByQuery: ReturnType<typeof vi.fn> }
  const agentConfig = { credentialsConfiguration: { formats: ['anoncreds'] } }

  beforeEach(() => {
    logger = createMock<Logger>()
    anoncredsRegistryService = createMock<AnoncredsRegistryService>()
    revocationService = createMock<RevocationRegistryService>()
    credentialService = new CredentialService(agentConfig as any, logger, anoncredsRegistryService, revocationService)
    messageRepository = { findByQuery: vi.fn().mockResolvedValue([]) }
    tenantAgent = createMock<TenantAgent>({
      context: { contextCorrelationId: 'tenant-1' },
      dependencyManager: {
        resolve: vi.fn((token: unknown) => (token === DidCommMessageRepository ? messageRepository : undefined)),
      },
      didcomm: {
        credentials: {
          findAllByQuery: vi.fn(),
          findById: vi.fn(),
          offerCredential: vi.fn(),
          acceptOffer: vi.fn(),
          sendRevocationNotification: vi.fn(),
        },
        connections: { findById: vi.fn() },
      },
      modules: {
        anoncreds: { updateRevocationStatusList: vi.fn() },
      },
    })
  })

  describe('find', () => {
    test('returns credential records by threadId', async () => {
      const mockRecords = [credentialRecord({ id: 'cred-1' }), credentialRecord({ id: 'cred-2' })]
      vi.mocked(tenantAgent.didcomm.credentials.findAllByQuery).mockResolvedValue(mockRecords)

      const result = await credentialService.find(tenantAgent, { threadId: 'thread-1' })

      expect(tenantAgent.didcomm.credentials.findAllByQuery).toHaveBeenCalledWith({ threadId: 'thread-1' })
      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('cred-1')
    })

    test('returns all credentials when no filter is given', async () => {
      vi.mocked(tenantAgent.didcomm.credentials.findAllByQuery).mockResolvedValue([])

      const result = await credentialService.find(tenantAgent)

      expect(tenantAgent.didcomm.credentials.findAllByQuery).toHaveBeenCalledWith({})
      expect(result).toHaveLength(0)
    })

    test('passes role and state filters and leaves out undefined keys', async () => {
      vi.mocked(tenantAgent.didcomm.credentials.findAllByQuery).mockResolvedValue([])

      await credentialService.find(tenantAgent, {
        threadId: undefined,
        role: DidCommCredentialRole.Issuer,
        state: DidCommCredentialState.Done,
      })

      expect(tenantAgent.didcomm.credentials.findAllByQuery).toHaveBeenCalledWith({
        role: DidCommCredentialRole.Issuer,
        state: DidCommCredentialState.Done,
      })
    })

    test('returns role, revocable and the ledger revocation status of issued credentials', async () => {
      vi.mocked(tenantAgent.didcomm.credentials.findAllByQuery).mockResolvedValue([
        credentialRecord({ id: 'active', registryId: 'rev-reg-1', revocationIndex: '1' }),
        credentialRecord({ id: 'revoked', registryId: 'rev-reg-1', revocationIndex: '2' }),
      ])
      vi.mocked(revocationService.get).mockResolvedValue({ timestamp: 1, revocationStatusList: [0, 0, 1] })
      vi.mocked(revocationService.findCredentialDefinitionId).mockResolvedValue('creddef-1')

      const [active, revoked] = await credentialService.find(tenantAgent, {
        role: DidCommCredentialRole.Issuer,
        state: DidCommCredentialState.Done,
      })

      expect(active).toMatchObject({
        id: 'active',
        role: DidCommCredentialRole.Issuer,
        revocable: true,
        revoked: false,
        credentialDefinitionId: 'creddef-1',
      })
      expect(revoked).toMatchObject({ id: 'revoked', revocable: true, revoked: true })
    })

    test('reads each revocation registry once', async () => {
      vi.mocked(tenantAgent.didcomm.credentials.findAllByQuery).mockResolvedValue([
        credentialRecord({ id: 'a', registryId: 'rev-reg-1', revocationIndex: '1' }),
        credentialRecord({ id: 'b', registryId: 'rev-reg-1', revocationIndex: '2' }),
        credentialRecord({ id: 'c', registryId: 'rev-reg-2', revocationIndex: '1' }),
        credentialRecord({ id: 'd', registryId: 'rev-reg-1', revocationIndex: '3' }),
        credentialRecord({ id: 'e', registryId: 'rev-reg-2', revocationIndex: '2' }),
      ])
      vi.mocked(revocationService.get).mockResolvedValue({ timestamp: 1, revocationStatusList: [0, 0, 0, 0] })

      await credentialService.find(tenantAgent)

      expect(revocationService.get).toHaveBeenCalledTimes(2)
      expect(revocationService.get).toHaveBeenCalledWith(tenantAgent, 'rev-reg-1')
      expect(revocationService.get).toHaveBeenCalledWith(tenantAgent, 'rev-reg-2')
      expect(revocationService.findCredentialDefinitionId).toHaveBeenCalledTimes(2)
    })

    test('leaves the status unknown when a registry cannot be read, without failing the list', async () => {
      vi.mocked(tenantAgent.didcomm.credentials.findAllByQuery).mockResolvedValue([
        credentialRecord({ id: 'unreadable', registryId: 'rev-reg-broken', revocationIndex: '1' }),
        credentialRecord({ id: 'readable', registryId: 'rev-reg-ok', revocationIndex: '1' }),
      ])
      vi.mocked(revocationService.get).mockImplementation((_agent, registryId) =>
        registryId === 'rev-reg-broken'
          ? Promise.reject(new NotFoundException('ledger unavailable'))
          : Promise.resolve({ timestamp: 1, revocationStatusList: [0, 1] }),
      )

      const [unreadable, readable] = await credentialService.find(tenantAgent)

      expect(unreadable.revocable).toBe(true)
      expect(unreadable.revoked).toBeUndefined()
      expect(readable).toMatchObject({ revocable: true, revoked: true })

      expect(logger.warn).toHaveBeenCalledTimes(1)
      expect(logger.warn).toHaveBeenCalledWith(
        { revocationRegistryDefinitionId: 'rev-reg-broken' },
        'Could not read revocation status list',
      )
      // Only the registry id is logged: no attributes, no error details
      expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain('attribute-value')
    })

    test('logs a warn and leaves the credential definition id unset when its lookup fails, without failing the list', async () => {
      vi.mocked(tenantAgent.didcomm.credentials.findAllByQuery).mockResolvedValue([
        credentialRecord({ id: 'no-creddef', registryId: 'rev-reg-broken', revocationIndex: '1' }),
        credentialRecord({ id: 'with-creddef', registryId: 'rev-reg-ok', revocationIndex: '0' }),
      ])
      vi.mocked(revocationService.get).mockResolvedValue({ timestamp: 1, revocationStatusList: [0, 1] })
      vi.mocked(revocationService.findCredentialDefinitionId).mockImplementation((_agent, registryId) =>
        registryId === 'rev-reg-broken'
          ? Promise.reject(new Error('wallet storage error for attribute-value'))
          : Promise.resolve('creddef-ok'),
      )

      const [noCreddef, withCreddef] = await credentialService.find(tenantAgent)

      expect(noCreddef).toMatchObject({ id: 'no-creddef', revocable: true, revoked: true })
      expect(noCreddef.credentialDefinitionId).toBeUndefined()
      expect(withCreddef).toMatchObject({ id: 'with-creddef', revoked: false, credentialDefinitionId: 'creddef-ok' })

      expect(logger.warn).toHaveBeenCalledTimes(1)
      expect(logger.warn).toHaveBeenCalledWith(
        { revocationRegistryDefinitionId: 'rev-reg-broken' },
        'Could not find the credential definition of revocation registry',
      )
      // Only the registry id is logged: no attributes, no error details
      expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain('attribute-value')
    })

    test('does not look up holder records, records without revocation tags or unfinished issuance', async () => {
      vi.mocked(tenantAgent.didcomm.credentials.findAllByQuery).mockResolvedValue([
        credentialRecord({
          id: 'holder',
          role: DidCommCredentialRole.Holder,
          registryId: 'rev-reg-1',
          revocationIndex: '1',
        }),
        credentialRecord({ id: 'no-tags' }),
        credentialRecord({
          id: 'pending',
          state: DidCommCredentialState.OfferSent,
          registryId: 'rev-reg-1',
          revocationIndex: '1',
        }),
      ])

      const [holder, noTags, pending] = await credentialService.find(tenantAgent)

      expect(holder).toMatchObject({ role: DidCommCredentialRole.Holder, revocable: false })
      expect(holder.revoked).toBeUndefined()
      expect(noTags.revocable).toBe(false)
      expect(noTags.revoked).toBeUndefined()
      expect(pending.revocable).toBe(true)
      expect(pending.revoked).toBeUndefined()
      expect(revocationService.get).not.toHaveBeenCalled()
    })

    test('takes the credential definition id from the record metadata before the registry', async () => {
      vi.mocked(tenantAgent.didcomm.credentials.findAllByQuery).mockResolvedValue([
        credentialRecord({ id: 'no-registry', credentialDefinitionId: 'creddef-from-metadata' }),
        credentialRecord({
          id: 'w3c',
          registryId: 'rev-reg-1',
          revocationIndex: '0',
        }),
      ])
      vi.mocked(revocationService.get).mockResolvedValue({ timestamp: 1, revocationStatusList: [0] })
      vi.mocked(revocationService.findCredentialDefinitionId).mockResolvedValue('creddef-from-registry')

      const [noRegistry, w3c] = await credentialService.find(tenantAgent)

      expect(noRegistry.credentialDefinitionId).toBe('creddef-from-metadata')
      expect(w3c.credentialDefinitionId).toBe('creddef-from-registry')
      expect(revocationService.findCredentialDefinitionId).toHaveBeenCalledWith(tenantAgent, 'rev-reg-1')
    })

    describe('format', () => {
      test('returns the format of each exchange from its offer message, read in one query', async () => {
        vi.mocked(tenantAgent.didcomm.credentials.findAllByQuery).mockResolvedValue([
          credentialRecord({ id: 'indy', registryId: 'rev-reg-1', revocationIndex: '0' }),
          credentialRecord({ id: 'w3c', registryId: 'rev-reg-1', revocationIndex: '1' }),
          credentialRecord({ id: 'no-offer' }),
        ])
        vi.mocked(revocationService.get).mockResolvedValue({ timestamp: 1, revocationStatusList: [0, 0] })
        messageRepository.findByQuery.mockResolvedValue([
          offerMessageRecord('indy', [anonCredsOffer]),
          offerMessageRecord('w3c', [dataIntegrityAnonCredsOffer]),
        ])

        const [indy, w3c, noOffer] = await credentialService.find(tenantAgent)

        expect(indy.format).toBe(AriesCredentialFormat.AnoncredsIndy)
        expect(w3c.format).toBe(AriesCredentialFormat.AnoncredsW3c)
        expect(noOffer.format).toBeUndefined()
        expect(messageRepository.findByQuery).toHaveBeenCalledTimes(1)
        expect(messageRepository.findByQuery).toHaveBeenCalledWith(tenantAgent.context, {
          protocolName: 'issue-credential',
          protocolMajorVersion: '2',
          messageName: 'offer-credential',
          $or: [{ associatedRecordId: 'indy' }, { associatedRecordId: 'w3c' }, { associatedRecordId: 'no-offer' }],
        })
      })

      test('splits the offer lookup into queries of at most 100 exchanges', async () => {
        const records = Array.from({ length: 201 }, (_, i) => credentialRecord({ id: `cred-${i}` }))
        vi.mocked(tenantAgent.didcomm.credentials.findAllByQuery).mockResolvedValue(records)
        messageRepository.findByQuery.mockImplementation((_context: unknown, query: OfferQuery) =>
          Promise.resolve(
            query.$or.some(({ associatedRecordId }) => associatedRecordId === 'cred-200')
              ? [offerMessageRecord('cred-200', [dataIntegrityAnonCredsOffer])]
              : [],
          ),
        )

        const result = await credentialService.find(tenantAgent)

        expect(messageRepository.findByQuery).toHaveBeenCalledTimes(3)
        const queries = messageRepository.findByQuery.mock.calls.map(([, query]) => query as OfferQuery)
        expect(queries.map((query) => query.$or.length)).toEqual([100, 100, 1])
        expect(result[200].format).toBe(AriesCredentialFormat.AnoncredsW3c)
        expect(result[0].format).toBeUndefined()
      })

      test('does not query the offers for an empty list', async () => {
        vi.mocked(tenantAgent.didcomm.credentials.findAllByQuery).mockResolvedValue([])

        await credentialService.find(tenantAgent)

        expect(messageRepository.findByQuery).not.toHaveBeenCalled()
      })

      test('leaves the format unknown and logs a warn without the error message when the offers cannot be read', async () => {
        vi.mocked(tenantAgent.didcomm.credentials.findAllByQuery).mockResolvedValue([
          credentialRecord({ id: 'cred-1', registryId: 'rev-reg-1', revocationIndex: '1' }),
        ])
        vi.mocked(revocationService.get).mockResolvedValue({ timestamp: 1, revocationStatusList: [0, 1] })
        messageRepository.findByQuery.mockRejectedValue(new Error('storage failed near attribute-value'))

        const [record] = await credentialService.find(tenantAgent)

        expect(record).toMatchObject({ id: 'cred-1', revocable: true, revoked: true })
        expect(record.format).toBeUndefined()
        expect(logger.warn).toHaveBeenCalledWith(
          { errorName: 'Error' },
          'Could not read the credential offers to determine credential formats',
        )
        expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain('attribute-value')
      })
    })
  })

  describe('types', () => {
    test('returns credential config from agent config', async () => {
      const result = await credentialService.types()

      expect(result).toBeDefined()
    })
  })

  describe('get', () => {
    test('returns credential record with role and revocable, without a ledger read', async () => {
      const mockRecord = credentialRecord({ id: 'cred-1', registryId: 'rev-reg-1', revocationIndex: '1' })
      vi.mocked(tenantAgent.didcomm.credentials.findById).mockResolvedValue(mockRecord)

      const result = await credentialService.get(tenantAgent, 'cred-1')

      expect(tenantAgent.didcomm.credentials.findById).toHaveBeenCalledWith('cred-1')
      expect(result).toMatchObject({ id: 'cred-1', role: DidCommCredentialRole.Issuer, revocable: true })
      expect(result.revoked).toBeUndefined()
      expect(revocationService.get).not.toHaveBeenCalled()
      expect(revocationService.findCredentialDefinitionId).not.toHaveBeenCalled()
    })

    test('returns the format from the offer message of the record', async () => {
      vi.mocked(tenantAgent.didcomm.credentials.findById).mockResolvedValue(credentialRecord({ id: 'cred-1' }))
      messageRepository.findByQuery.mockResolvedValue([offerMessageRecord('cred-1', [dataIntegrityAnonCredsOffer])])

      const result = await credentialService.get(tenantAgent, 'cred-1')

      expect(result.format).toBe(AriesCredentialFormat.AnoncredsW3c)
      expect(messageRepository.findByQuery).toHaveBeenCalledWith(
        tenantAgent.context,
        expect.objectContaining({ $or: [{ associatedRecordId: 'cred-1' }] }),
      )
    })

    test('throws NotFoundException when not found', async () => {
      vi.mocked(tenantAgent.didcomm.credentials.findById).mockResolvedValue(null)

      await expect(credentialService.get(tenantAgent, 'missing')).rejects.toThrow(NotFoundException)
      expect(tenantAgent.didcomm.credentials.findById).toHaveBeenCalledWith('missing')
    })
  })

  describe('accept', () => {
    test('accepts credential offer', async () => {
      const mockRecord = credentialRecord({ id: 'cred-1', state: DidCommCredentialState.OfferReceived })
      vi.mocked(tenantAgent.didcomm.credentials.findById).mockResolvedValue(mockRecord)

      const acceptedRecord = credentialRecord({ id: 'cred-1', state: DidCommCredentialState.Done })
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
      const mockRecord = credentialRecord({ id: 'cred-1', state: DidCommCredentialState.Done })
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

      const mockCredRecord = credentialRecord({ id: 'cred-new', state: DidCommCredentialState.OfferSent })
      vi.mocked(tenantAgent.didcomm.credentials.offerCredential).mockResolvedValue(mockCredRecord)

      const result = await credentialService.offer(tenantAgent, {
        connectionId: 'conn-1',
        credentialDefinitionId: 'creddef-1',
        attributes: [
          { name: 'name', value: 'Alice' },
          { name: 'age', value: '30' },
        ],
      })

      expect(tenantAgent.didcomm.connections.findById).toHaveBeenCalledWith('conn-1')
      expect(anoncredsRegistryService.getCredentialDefinition).toHaveBeenCalledWith(tenantAgent, 'creddef-1')
      expect(anoncredsRegistryService.getSchema).toHaveBeenCalledWith(tenantAgent, 'schema-1')
      expect(tenantAgent.didcomm.credentials.offerCredential).toHaveBeenCalledWith(
        expect.objectContaining({ connectionId: 'conn-1', protocolVersion: 'v2' }),
      )
      expect(result.id).toBe('cred-new')
      expect(result.format).toBe(AriesCredentialFormat.AnoncredsIndy)
      expect(revocationService.getOrCreate).not.toHaveBeenCalled()
      expect(messageRepository.findByQuery).not.toHaveBeenCalled()
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

      const mockCredRecord = credentialRecord({ id: 'cred-rev', state: DidCommCredentialState.OfferSent })
      vi.mocked(tenantAgent.didcomm.credentials.offerCredential).mockResolvedValue(mockCredRecord)

      const result = await credentialService.offer(tenantAgent, {
        connectionId: 'conn-1',
        credentialDefinitionId: 'creddef-1',
        attributes: [{ name: 'name', value: 'Alice' }],
        format: AriesCredentialFormat.AnoncredsW3c,
      })

      expect(tenantAgent.didcomm.connections.findById).toHaveBeenCalledWith('conn-1')
      expect(anoncredsRegistryService.getCredentialDefinition).toHaveBeenCalledWith(tenantAgent, 'creddef-1')
      expect(revocationService.getOrCreate).toHaveBeenCalledWith(tenantAgent, 'creddef-1', 'issuer-1')
      expect(anoncredsRegistryService.getSchema).toHaveBeenCalledWith(tenantAgent, 'schema-1')
      expect(tenantAgent.didcomm.credentials.offerCredential).toHaveBeenCalled()
      expect(result.id).toBe('cred-rev')
      expect(result.format).toBe(AriesCredentialFormat.AnoncredsW3c)
      expect(revocationService.update).toHaveBeenCalledWith(tenantAgent, 'rev-reg-1', { lastIndex: 5 })
    })
  })

  describe('revoke', () => {
    const registryId = 'did:hedera:testnet:issuer/anoncreds/v0/REV_REG_DEF/rev-reg-1'
    const revocableRecord = (revocationIndex = '3') =>
      credentialRecord({ id: 'cred-1', registryId, revocationIndex, connectionId: 'conn-1' })

    const ledgerUpdate = (state: 'finished' | 'failed') => {
      vi.mocked(revocationService.get).mockResolvedValue({ revocationStatusList: { 3: 0 } } as any)
      vi.mocked(tenantAgent.modules.anoncreds.updateRevocationStatusList).mockResolvedValue({
        revocationStatusListState: { state },
      } as any)
    }

    test('throws NotFoundException when the credential record does not exist', async () => {
      vi.mocked(tenantAgent.didcomm.credentials.findById).mockResolvedValue(null)

      await expect(credentialService.revoke(tenantAgent, 'missing')).rejects.toThrow(NotFoundException)
      expect(tenantAgent.didcomm.credentials.findById).toHaveBeenCalledWith('missing')
      expect(revocationService.get).not.toHaveBeenCalled()
    })

    test('throws BadRequestException for a holder record even when it carries revocation tags', async () => {
      vi.mocked(tenantAgent.didcomm.credentials.findById).mockResolvedValue(
        credentialRecord({
          id: 'cred-1',
          role: DidCommCredentialRole.Holder,
          registryId: 'rev-reg-1',
          revocationIndex: '3',
          connectionId: 'conn-1',
        }),
      )

      await expect(credentialService.revoke(tenantAgent, 'cred-1')).rejects.toThrow(
        new BadRequestException('Only credentials issued by this wallet can be revoked'),
      )
      expect(revocationService.get).not.toHaveBeenCalled()
      expect(tenantAgent.modules.anoncreds.updateRevocationStatusList).not.toHaveBeenCalled()
      expect(tenantAgent.didcomm.credentials.sendRevocationNotification).not.toHaveBeenCalled()
    })

    test('throws BadRequestException when credential does not support revocation', async () => {
      vi.mocked(tenantAgent.didcomm.credentials.findById).mockResolvedValue(
        credentialRecord({ id: 'cred-1', connectionId: 'conn-1' }),
      )

      await expect(credentialService.revoke(tenantAgent, 'cred-1')).rejects.toThrow(BadRequestException)
      expect(tenantAgent.didcomm.credentials.findById).toHaveBeenCalledWith('cred-1')
      expect(tenantAgent.didcomm.credentials.sendRevocationNotification).not.toHaveBeenCalled()
    })

    test('throws ConflictException when credential already revoked', async () => {
      vi.mocked(tenantAgent.didcomm.credentials.findById).mockResolvedValue(revocableRecord('5'))
      vi.mocked(revocationService.get).mockResolvedValue({ revocationStatusList: { 5: 1 } } as any)

      await expect(credentialService.revoke(tenantAgent, 'cred-1')).rejects.toThrow(ConflictException)
      expect(tenantAgent.didcomm.credentials.findById).toHaveBeenCalledWith('cred-1')
      expect(revocationService.get).toHaveBeenCalledWith(tenantAgent, registryId)
      expect(tenantAgent.modules.anoncreds.updateRevocationStatusList).not.toHaveBeenCalled()
      expect(tenantAgent.didcomm.credentials.sendRevocationNotification).not.toHaveBeenCalled()
    })

    test('throws InternalServerErrorException when revocation index is not a number', async () => {
      vi.mocked(tenantAgent.didcomm.credentials.findById).mockResolvedValue(revocableRecord('not-a-number'))

      await expect(credentialService.revoke(tenantAgent, 'cred-1')).rejects.toThrow(InternalServerErrorException)
      expect(tenantAgent.didcomm.credentials.findById).toHaveBeenCalledWith('cred-1')
      expect(tenantAgent.didcomm.credentials.sendRevocationNotification).not.toHaveBeenCalled()
    })

    test('revokes credential successfully', async () => {
      vi.mocked(tenantAgent.didcomm.credentials.findById).mockResolvedValue(revocableRecord('3'))
      ledgerUpdate('finished')

      await expect(credentialService.revoke(tenantAgent, 'cred-1')).resolves.toBeUndefined()

      expect(tenantAgent.didcomm.credentials.findById).toHaveBeenCalledWith('cred-1')
      expect(revocationService.get).toHaveBeenCalledWith(tenantAgent, registryId)
      expect(tenantAgent.modules.anoncreds.updateRevocationStatusList).toHaveBeenCalledWith(
        expect.objectContaining({
          revocationStatusList: {
            revocationRegistryDefinitionId: registryId,
            revokedCredentialIndexes: [3],
          },
        }),
      )
    })

    test('throws InternalServerErrorException when revocation update fails', async () => {
      vi.mocked(tenantAgent.didcomm.credentials.findById).mockResolvedValue(revocableRecord('3'))
      ledgerUpdate('failed')

      await expect(credentialService.revoke(tenantAgent, 'cred-1')).rejects.toThrow(InternalServerErrorException)
      expect(tenantAgent.didcomm.credentials.findById).toHaveBeenCalledWith('cred-1')
      expect(revocationService.get).toHaveBeenCalledWith(tenantAgent, registryId)
      expect(tenantAgent.modules.anoncreds.updateRevocationStatusList).toHaveBeenCalled()
      expect(tenantAgent.didcomm.credentials.sendRevocationNotification).not.toHaveBeenCalled()
    })

    test('does not notify the holder when the ledger update throws', async () => {
      vi.mocked(tenantAgent.didcomm.credentials.findById).mockResolvedValue(revocableRecord('3'))
      vi.mocked(revocationService.get).mockResolvedValue({ revocationStatusList: { 3: 0 } } as any)
      vi.mocked(tenantAgent.modules.anoncreds.updateRevocationStatusList).mockRejectedValue(new Error('ledger down'))

      await expect(credentialService.revoke(tenantAgent, 'cred-1')).rejects.toThrow('ledger down')
      expect(tenantAgent.didcomm.credentials.sendRevocationNotification).not.toHaveBeenCalled()
    })

    describe('revocation notification', () => {
      // Copy of Credo's `v2AnonCredsRevocationIdentifierRegex`, which the holder uses to parse `credential_id`
      const holderRevocationIdRegex = /([a-zA-Z0-9+\-.]+:.+)::(\d+)$/

      test('notifies the holder over the connection after the ledger update succeeds', async () => {
        vi.mocked(tenantAgent.didcomm.credentials.findById).mockResolvedValue(revocableRecord('3'))
        ledgerUpdate('finished')

        await expect(credentialService.revoke(tenantAgent, 'cred-1')).resolves.toBeUndefined()

        expect(tenantAgent.didcomm.credentials.sendRevocationNotification).toHaveBeenCalledTimes(1)
        expect(tenantAgent.didcomm.credentials.sendRevocationNotification).toHaveBeenCalledWith({
          connectionId: 'conn-1',
          credentialExchangeRecordId: 'cred-1',
          revocationFormat: 'anoncreds',
          revocationId: `${registryId}::3`,
        })
        expect(
          vi.mocked(tenantAgent.modules.anoncreds.updateRevocationStatusList).mock.invocationCallOrder[0],
        ).toBeLessThan(
          vi.mocked(tenantAgent.didcomm.credentials.sendRevocationNotification).mock.invocationCallOrder[0],
        )

        // The holder recovers the registry id and the index it stored as record tags
        const [{ revocationId }] = vi.mocked(tenantAgent.didcomm.credentials.sendRevocationNotification).mock.calls[0]
        const [, holderRegistryId, holderIndex] = revocationId.match(holderRevocationIdRegex) ?? []
        expect(holderRegistryId).toBe(registryId)
        expect(holderIndex).toBe('3')
        expect(logger.warn).not.toHaveBeenCalled()
      })

      test('skips the notification without an error when the record has no connection', async () => {
        vi.mocked(tenantAgent.didcomm.credentials.findById).mockResolvedValue(
          credentialRecord({ id: 'cred-1', registryId, revocationIndex: '3' }),
        )
        ledgerUpdate('finished')

        await expect(credentialService.revoke(tenantAgent, 'cred-1')).resolves.toBeUndefined()

        expect(tenantAgent.modules.anoncreds.updateRevocationStatusList).toHaveBeenCalled()
        expect(tenantAgent.didcomm.credentials.sendRevocationNotification).not.toHaveBeenCalled()
        expect(logger.warn).not.toHaveBeenCalled()
      })

      test('still succeeds and logs one warn with identifiers only when sending fails', async () => {
        vi.mocked(tenantAgent.didcomm.credentials.findById).mockResolvedValue(revocableRecord('3'))
        ledgerUpdate('finished')
        vi.mocked(tenantAgent.didcomm.credentials.sendRevocationNotification).mockRejectedValue(
          new Error('Holder unreachable, credential attribute-value'),
        )

        await expect(credentialService.revoke(tenantAgent, 'cred-1')).resolves.toBeUndefined()

        expect(logger.warn).toHaveBeenCalledTimes(1)
        expect(logger.warn).toHaveBeenCalledWith(
          { credentialExchangeRecordId: 'cred-1', revocationRegistryDefinitionId: registryId, errorName: 'Error' },
          'Could not send the revocation notification to the holder',
        )
        const logged = JSON.stringify(vi.mocked(logger.warn).mock.calls)
        expect(logged).not.toContain('attribute-value')
        expect(logged).not.toContain('Holder unreachable')
      })
    })
  })
})
