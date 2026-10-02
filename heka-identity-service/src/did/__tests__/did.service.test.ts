import { createMock } from '@golevelup/ts-vitest'
import { EntityManager } from '@mikro-orm/core'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { ConfigType } from '@nestjs/config'

import { Agent, TenantAgent } from 'common/agent'
import { AuthInfo, Role } from 'common/auth'
import { AuthorizationService } from 'common/authz'
import { DidRegistrarService } from 'common/did-registrar'
import { User, Wallet } from 'common/entities'
import { Logger } from 'common/logger'

import { didDocumentStub, didRecordStub, didResolutionResultStub, entityStub } from '../../../test/helpers/mock-records'
import AgentConfig from '../../config/agent'
import { DidService } from '../did.service'

describe('DidService', () => {
  let didService: DidService
  let agent: Agent
  let em: EntityManager
  let logger: Logger
  let didRegistrarService: DidRegistrarService
  let tenantAgent: TenantAgent
  const agentConfig = createMock<ConfigType<typeof AgentConfig>>({ didMethods: ['key', 'indy'] })

  beforeEach(() => {
    agent = createMock<Agent>({
      agencyConfig: { indyEndorserDid: 'endorser-did', networks: [{ indyNamespace: 'test-ns' }] },
    })
    em = createMock<EntityManager>()
    logger = createMock<Logger>()
    didRegistrarService = createMock<DidRegistrarService>()
    didService = new DidService(
      agent,
      em,
      logger,
      didRegistrarService,
      agentConfig,
      new AuthorizationService({ enabled: true }),
    )
    tenantAgent = createMock<TenantAgent>({
      dids: {
        getCreatedDids: vi.fn(),
        resolveDidDocument: vi.fn(),
        resolve: vi.fn(),
      },
    })
  })

  describe('find', () => {
    test('throws BadRequestException when own flag is not set', async () => {
      await expect(didService.find(tenantAgent, { own: false })).rejects.toThrow(BadRequestException)
    })

    test('returns DID documents, excluding endorser DID', async () => {
      const mockRecords = [
        didRecordStub({ did: 'did:key:z1', didDocument: didDocumentStub({ id: 'did:key:z1' }) }),
        didRecordStub({ did: 'endorser-did', didDocument: didDocumentStub({ id: 'endorser-did' }) }),
        didRecordStub({ did: 'did:key:z2', didDocument: undefined }),
      ]
      vi.mocked(tenantAgent.dids.getCreatedDids).mockResolvedValue(mockRecords)
      vi.mocked(tenantAgent.dids.resolveDidDocument).mockResolvedValue(didDocumentStub({ id: 'did:key:z2' }))

      const result = await didService.find(tenantAgent, { method: 'key', own: true })

      expect(tenantAgent.dids.getCreatedDids).toHaveBeenCalledWith({ method: 'key' })
      expect(tenantAgent.dids.resolveDidDocument).toHaveBeenCalledWith('did:key:z2')
      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('did:key:z1')
      expect(result[1].id).toBe('did:key:z2')
    })

    test('uses cached didDocument when available', async () => {
      const mockRecords = [didRecordStub({ did: 'did:key:z1', didDocument: didDocumentStub({ id: 'did:key:z1' }) })]
      vi.mocked(tenantAgent.dids.getCreatedDids).mockResolvedValue(mockRecords)

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
    const makeAuthInfo = (role: Role, walletId: string, orgId?: string): AuthInfo => ({
      userId: 'user-1',
      user: entityStub<User>({}),
      userName: 'testuser',
      role,
      orgId,
      walletId,
      tenantId: 'tenant-1',
    })

    const makeService = (enabled: boolean) =>
      new DidService(agent, em, logger, didRegistrarService, agentConfig, new AuthorizationService({ enabled }))

    test('creates the main-method DID in the caller tenant and persists it as the wallet public DID', async () => {
      const wallet = entityStub<Wallet>({ id: 'Administration', publicDid: undefined })
      vi.mocked(em.findOneOrFail).mockResolvedValue(wallet)
      vi.mocked(didRegistrarService.createDid).mockResolvedValue(didDocumentStub({ id: 'did:key:root' }))

      const result = await didService.create(makeAuthInfo(Role.Admin, 'Administration'), {})

      expect(result.id).toBe('did:key:root')
      expect(didRegistrarService.createDid).toHaveBeenCalledWith('tenant-1', 'key', { namespace: 'test-ns' })
      expect(wallet.publicDid).toBe('did:key:root')
      expect(em.flush).toHaveBeenCalled()
    })

    test('creates a non-main DID without touching the wallet public DID', async () => {
      const wallet = entityStub<Wallet>({ id: 'Administration', publicDid: 'did:key:root' })
      vi.mocked(em.findOneOrFail).mockResolvedValue(wallet)
      vi.mocked(didRegistrarService.createDid).mockResolvedValue(didDocumentStub({ id: 'did:indy:test-ns:own' }))

      const result = await didService.create(makeAuthInfo(Role.Admin, 'Administration'), { method: 'indy' })

      expect(result.id).toBe('did:indy:test-ns:own')
      expect(wallet.publicDid).toBe('did:key:root')
    })

    test('1. rejects a role without the did capability before anything else', async () => {
      await expect(didService.create(makeAuthInfo(Role.OrgManager, 'Organization_org-1', 'org-1'), {})).rejects.toThrow(
        ForbiddenException,
      )
      expect(em.findOneOrFail).not.toHaveBeenCalled()
      expect(didRegistrarService.createDid).not.toHaveBeenCalled()
    })

    test('2. returns 409 when the wallet already has its main-method DID, before the controller check', async () => {
      vi.mocked(em.findOneOrFail).mockResolvedValue(
        entityStub<Wallet>({ id: 'Member_user-1_in_Organization_org-1', publicDid: 'did:key:existing' }),
      )

      await expect(
        didService.create(makeAuthInfo(Role.Issuer, 'Member_user-1_in_Organization_org-1', 'org-1'), {}),
      ).rejects.toThrow(ConflictException)
      expect(em.findOne).not.toHaveBeenCalled()
    })

    test.each([
      [Role.OrgAdmin, 'Organization_org-1', 'Administration'],
      [Role.Issuer, 'Member_user-1_in_Organization_org-1', 'Organization_org-1'],
      [Role.Verifier, 'Member_user-1_in_Organization_org-1', 'Organization_org-1'],
    ])('3. %s gets 422 until its controller %s has a public DID', async (role, walletId, controllerId) => {
      vi.mocked(em.findOneOrFail).mockResolvedValue(entityStub<Wallet>({ id: walletId, publicDid: undefined }))
      vi.mocked(em.findOne).mockResolvedValue(entityStub<Wallet>({ id: controllerId, publicDid: undefined }))

      await expect(didService.create(makeAuthInfo(role, walletId, 'org-1'), {})).rejects.toThrow(
        UnprocessableEntityException,
      )
      expect(em.findOne).toHaveBeenCalledWith(Wallet, { id: controllerId })
      expect(didRegistrarService.createDid).not.toHaveBeenCalled()
    })

    test('3. once the controller has a public DID, the DID is created in the caller tenant', async () => {
      vi.mocked(em.findOneOrFail).mockResolvedValue(
        entityStub<Wallet>({ id: 'Member_user-1_in_Organization_org-1', publicDid: undefined }),
      )
      vi.mocked(em.findOne).mockResolvedValue(
        entityStub<Wallet>({ id: 'Organization_org-1', publicDid: 'did:key:org', tenantId: 'org-tenant' }),
      )
      vi.mocked(didRegistrarService.createDid).mockResolvedValue(didDocumentStub({ id: 'did:indy:test-ns:issuer' }))

      await didService.create(makeAuthInfo(Role.Issuer, 'Member_user-1_in_Organization_org-1', 'org-1'), {
        method: 'indy',
      })

      expect(didRegistrarService.createDid).toHaveBeenCalledWith('tenant-1', 'indy', { namespace: 'test-ns' })
    })

    test('4. an unsupported method is rejected by the registrar after the authorization checks', async () => {
      vi.mocked(em.findOneOrFail).mockResolvedValue(entityStub<Wallet>({ id: 'Administration', publicDid: undefined }))
      vi.mocked(didRegistrarService.createDid).mockRejectedValue(
        new BadRequestException("DID Method 'foo' is not supported"),
      )

      await expect(didService.create(makeAuthInfo(Role.Admin, 'Administration'), { method: 'foo' })).rejects.toThrow(
        BadRequestException,
      )
    })

    test('re-reads the wallet so a main-method DID persisted concurrently is observed', async () => {
      vi.mocked(em.findOneOrFail).mockResolvedValue(entityStub<Wallet>({ id: 'Administration', publicDid: undefined }))
      vi.mocked(didRegistrarService.createDid).mockResolvedValue(didDocumentStub({ id: 'did:key:root' }))

      await didService.create(makeAuthInfo(Role.Admin, 'Administration'), {})

      expect(em.findOneOrFail).toHaveBeenCalledWith(Wallet, { id: 'Administration' }, { refresh: true })
    })

    test('concurrent main-method creates for one wallet create exactly one DID, the other gets 409', async () => {
      const wallet = entityStub<Wallet>({ id: 'Administration', publicDid: undefined })
      vi.mocked(em.findOneOrFail).mockResolvedValue(wallet)
      vi.mocked(didRegistrarService.createDid).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(didDocumentStub({ id: 'did:key:root' })), 10)),
      )
      const authInfo = makeAuthInfo(Role.Admin, 'Administration')

      const results = await Promise.allSettled([didService.create(authInfo, {}), didService.create(authInfo, {})])

      expect(didRegistrarService.createDid).toHaveBeenCalledTimes(1)
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
      const rejected = results.find((result) => result.status === 'rejected') as PromiseRejectedResult
      expect(rejected.reason).toBeInstanceOf(ConflictException)
      expect(wallet.publicDid).toBe('did:key:root')
    })

    test('the main-method lock is released when DID creation fails', async () => {
      const wallet = entityStub<Wallet>({ id: 'Administration', publicDid: undefined })
      vi.mocked(em.findOneOrFail).mockResolvedValue(wallet)
      vi.mocked(didRegistrarService.createDid)
        .mockRejectedValueOnce(new Error('KMS failure'))
        .mockResolvedValueOnce(didDocumentStub({ id: 'did:key:root' }))
      const authInfo = makeAuthInfo(Role.Admin, 'Administration')

      await expect(didService.create(authInfo, {})).rejects.toThrow('KMS failure')
      const result = await didService.create(authInfo, {})

      expect(result.id).toBe('did:key:root')
      expect(wallet.publicDid).toBe('did:key:root')
    })

    test('concurrent non-main creates are not serialized', async () => {
      vi.mocked(em.findOneOrFail).mockResolvedValue(
        entityStub<Wallet>({ id: 'Administration', publicDid: 'did:key:root' }),
      )
      let pending = 0
      let maxPending = 0
      vi.mocked(didRegistrarService.createDid).mockImplementation(() => {
        pending++
        maxPending = Math.max(maxPending, pending)
        return new Promise((resolve) =>
          setTimeout(() => {
            pending--
            resolve(didDocumentStub({ id: 'did:indy:test-ns:own' }))
          }, 10),
        )
      })
      const authInfo = makeAuthInfo(Role.Admin, 'Administration')

      await Promise.all([
        didService.create(authInfo, { method: 'indy' }),
        didService.create(authInfo, { method: 'indy' }),
      ])

      expect(didRegistrarService.createDid).toHaveBeenCalledTimes(2)
      expect(maxPending).toBe(2)
    })

    test('simplified mode skips the capability and controller checks', async () => {
      const service = makeService(false)
      const wallet = entityStub<Wallet>({ id: 'Member_user-1_in_Organization_org-1', publicDid: undefined })
      vi.mocked(em.findOneOrFail).mockResolvedValue(wallet)
      vi.mocked(didRegistrarService.createDid).mockResolvedValue(didDocumentStub({ id: 'did:key:member' }))

      await service.create(makeAuthInfo(Role.OrgMember, 'Member_user-1_in_Organization_org-1', 'org-1'), {})

      expect(em.findOne).not.toHaveBeenCalled()
      expect(wallet.publicDid).toBe('did:key:member')
    })
  })
})
