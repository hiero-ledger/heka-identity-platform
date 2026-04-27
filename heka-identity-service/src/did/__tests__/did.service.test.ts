import { createMock } from '@golevelup/ts-vitest'
import { EntityManager } from '@mikro-orm/core'
import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'

import { Agent, TenantAgent } from 'common/agent'
import { Role } from 'common/auth'
import { DidRegistrarService } from 'common/did-registrar'
import { Wallet } from 'common/entities'
import { Logger } from 'common/logger'

import { didResolutionResultStub } from '../../../test/helpers/mock-records'
import { DidService } from '../did.service'

describe('DidService', () => {
  let didService: DidService
  let agent: Agent
  let em: EntityManager
  let logger: Logger
  let didRegistrarService: DidRegistrarService
  let tenantAgent: TenantAgent
  const agentConfig = { didMethods: ['key', 'indy'] }

  beforeEach(() => {
    agent = createMock<Agent>({
      agencyConfig: { indyEndorserDid: 'endorser-did', networks: [{ indyNamespace: 'test-ns' }] },
    })
    em = createMock<EntityManager>()
    logger = createMock<Logger>()
    didRegistrarService = createMock<DidRegistrarService>()
    didService = new DidService(agent, em, logger, didRegistrarService, agentConfig as any)
    tenantAgent = createMock<TenantAgent>({
      dids: {
        getCreatedDids: vi.fn(),
        resolveDidDocument: vi.fn(),
        resolve: vi.fn(),
      } as any,
    })
  })

  describe('find', () => {
    test('throws BadRequestException when own flag is not set', async () => {
      await expect(didService.find(tenantAgent, { own: false })).rejects.toThrow(BadRequestException)
    })

    test('returns DID documents, excluding endorser DID', async () => {
      const mockRecords = [
        { did: 'did:key:z1', didDocument: { id: 'did:key:z1' } },
        { did: 'endorser-did', didDocument: { id: 'endorser-did' } },
        { did: 'did:key:z2', didDocument: null },
      ]
      vi.mocked(tenantAgent.dids.getCreatedDids).mockResolvedValue(mockRecords as any)
      vi.mocked(tenantAgent.dids.resolveDidDocument).mockResolvedValue({ id: 'did:key:z2' } as any)

      const result = await didService.find(tenantAgent, { method: 'key', own: true })

      expect(tenantAgent.dids.getCreatedDids).toHaveBeenCalledWith({ method: 'key' })
      expect(tenantAgent.dids.resolveDidDocument).toHaveBeenCalledWith('did:key:z2')
      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('did:key:z1')
      expect(result[1].id).toBe('did:key:z2')
    })

    test('uses cached didDocument when available', async () => {
      const mockRecords = [{ did: 'did:key:z1', didDocument: { id: 'did:key:z1' } }]
      vi.mocked(tenantAgent.dids.getCreatedDids).mockResolvedValue(mockRecords as any)

      const result = await didService.find(tenantAgent, { own: true })

      expect(tenantAgent.dids.getCreatedDids).toHaveBeenCalledWith({ method: undefined })
      expect(result).toHaveLength(1)
      expect(tenantAgent.dids.resolveDidDocument).not.toHaveBeenCalled()
    })
  })

  describe('get', () => {
    test('returns DID document on successful resolution', async () => {
      vi.mocked(tenantAgent.dids.resolve).mockResolvedValue(
        didResolutionResultStub({ didDocument: { id: 'did:key:z1' } }),
      )

      const result = await didService.get(tenantAgent, 'did:key:z1')

      expect(tenantAgent.dids.resolve).toHaveBeenCalledWith('did:key:z1')
      expect(result.id).toBe('did:key:z1')
    })

    test('throws NotFoundException when DID not found', async () => {
      vi.mocked(tenantAgent.dids.resolve).mockResolvedValue(
        didResolutionResultStub({
          didDocument: null,
          didResolutionMetadata: { error: 'notFound', message: 'Not found' },
        }),
      )

      await expect(didService.get(tenantAgent, 'did:key:missing')).rejects.toThrow(NotFoundException)
      expect(tenantAgent.dids.resolve).toHaveBeenCalledWith('did:key:missing')
    })

    test('throws BadRequestException for unsupportedDidMethod', async () => {
      vi.mocked(tenantAgent.dids.resolve).mockResolvedValue(
        didResolutionResultStub({
          didDocument: null,
          didResolutionMetadata: { error: 'unsupportedDidMethod', message: 'Unsupported' },
        }),
      )

      await expect(didService.get(tenantAgent, 'did:bad:z1')).rejects.toThrow(BadRequestException)
      expect(tenantAgent.dids.resolve).toHaveBeenCalledWith('did:bad:z1')
    })

    test('throws BadRequestException for invalidDid', async () => {
      vi.mocked(tenantAgent.dids.resolve).mockResolvedValue(
        didResolutionResultStub({
          didDocument: null,
          didResolutionMetadata: { error: 'invalidDid', message: 'Invalid' },
        }),
      )

      await expect(didService.get(tenantAgent, 'invalid')).rejects.toThrow(BadRequestException)
      expect(tenantAgent.dids.resolve).toHaveBeenCalledWith('invalid')
    })

    test('throws InternalServerErrorException for unknown errors', async () => {
      vi.mocked(tenantAgent.dids.resolve).mockResolvedValue(
        didResolutionResultStub({
          didDocument: null,
          didResolutionMetadata: { error: 'internalError', message: 'Something broke' },
        }),
      )

      await expect(didService.get(tenantAgent, 'did:key:z1')).rejects.toThrow(InternalServerErrorException)
      expect(tenantAgent.dids.resolve).toHaveBeenCalledWith('did:key:z1')
    })
  })

  describe('getMethods', () => {
    test('returns DID methods from config', () => {
      const result = didService.getMethods()

      expect(result.methods).toEqual(['key', 'indy'])
    })
  })

  describe('create', () => {
    const baseAuthInfo = {
      userId: 'user-1',
      user: {} as any,
      userName: 'testuser',
      walletId: 'wallet-1',
      tenantId: 'tenant-1',
    }

    test('throws when wallet already has a publicDid', async () => {
      vi.mocked(em.findOneOrFail).mockResolvedValue({ id: 'wallet-1', publicDid: 'did:indy:existing' })

      const authInfo = { ...baseAuthInfo, role: Role.Admin }

      await expect(didService.create(authInfo as any, { method: 'indy' } as any)).rejects.toThrow(
        'The wallet already contains created public DID: did:indy:existing',
      )
      expect(em.findOneOrFail).toHaveBeenCalledWith(Wallet, { id: 'wallet-1' })
    })

    test('creates DID via didRegistrarService when no controller wallet is required (Admin role)', async () => {
      vi.mocked(em.findOneOrFail).mockResolvedValue({ id: 'wallet-1', publicDid: null })

      const didDocument = {
        id: 'did:indy:test-ns:newdid',
        verificationMethod: [{ id: 'did:indy:test-ns:newdid#key-1' }],
      }
      vi.mocked(didRegistrarService.createDid).mockResolvedValue(didDocument as any)
      vi.mocked(em.flush).mockResolvedValue(undefined)

      const authInfo = { ...baseAuthInfo, role: Role.Admin }

      const result = await didService.create(authInfo as any, { method: 'indy' } as any)

      expect(em.findOneOrFail).toHaveBeenCalledWith(Wallet, { id: 'wallet-1' })
      expect(result.id).toBe('did:indy:test-ns:newdid')
      expect(didRegistrarService.createDid).toHaveBeenCalledWith('tenant-1', 'indy', {
        namespace: 'test-ns',
      })
      expect(em.flush).toHaveBeenCalled()
    })

    test('throws UnprocessableEntityException when didControllerWallet is not found', async () => {
      vi.mocked(em.findOneOrFail).mockResolvedValue({ id: 'wallet-1', publicDid: null })
      vi.mocked(em.findOne).mockResolvedValue(null)

      const authInfo = { ...baseAuthInfo, role: Role.OrgAdmin, orgId: 'org-1' }

      await expect(didService.create(authInfo as any, { method: 'indy' } as any)).rejects.toThrow(
        UnprocessableEntityException,
      )
      expect(em.findOneOrFail).toHaveBeenCalledWith(Wallet, { id: 'wallet-1' })
      expect(em.findOne).toHaveBeenCalledWith(Wallet, { id: 'Administration' })
    })

    test('throws UnprocessableEntityException when didControllerWallet has no publicDid', async () => {
      vi.mocked(em.findOneOrFail).mockResolvedValue({ id: 'wallet-1', publicDid: null })
      vi.mocked(em.findOne).mockResolvedValue({ id: 'Administration', publicDid: null })

      const authInfo = { ...baseAuthInfo, role: Role.OrgAdmin, orgId: 'org-1' }

      await expect(didService.create(authInfo as any, { method: 'indy' } as any)).rejects.toThrow(
        UnprocessableEntityException,
      )
      expect(em.findOneOrFail).toHaveBeenCalledWith(Wallet, { id: 'wallet-1' })
      expect(em.findOne).toHaveBeenCalledWith(Wallet, { id: 'Administration' })
    })
  })
})
