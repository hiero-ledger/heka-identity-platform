import { DidDocument, DidDocumentRole, DidDocumentService, DidRecord, VerificationMethod } from '@credo-ts/core'
import { createMock } from '@golevelup/ts-vitest'
import { EntityManager } from '@mikro-orm/core'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { ConfigType } from '@nestjs/config'

import { Agent, TenantAgent } from 'common/agent'
import { AuthInfo, Role } from 'common/auth'
import { AuthorizationService } from 'common/authz'
import { DidRegistrar, DidRegistrarService } from 'common/did-registrar'
import { User, Wallet } from 'common/entities'
import { Logger } from 'common/logger'
import { WalletLockService } from 'common/wallet-lock'

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
  let walletLockService: WalletLockService
  const agentConfig = createMock<ConfigType<typeof AgentConfig>>({ didMethods: ['key', 'indy'] })

  beforeEach(() => {
    agent = createMock<Agent>({
      agencyConfig: { indyEndorserDid: 'endorser-did', networks: [{ indyNamespace: 'test-ns' }] },
    })
    em = createMock<EntityManager>()
    // The wallet's `public_did` is still empty, so the claim succeeds
    vi.mocked(em.nativeUpdate).mockResolvedValue(1)
    logger = createMock<Logger>()
    didRegistrarService = createMock<DidRegistrarService>()
    walletLockService = createMock<WalletLockService>({
      runExclusive: vi.fn((_walletId: string, _timeout: number, operation: () => Promise<unknown>) => operation()),
    })
    didService = new DidService(
      agent,
      em,
      logger,
      didRegistrarService,
      agentConfig,
      new AuthorizationService({ enabled: true }),
      walletLockService,
    )
    tenantAgent = createMock<TenantAgent>({
      dids: {
        getCreatedDids: vi.fn().mockResolvedValue([]),
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

    test('leaves out DIDs the wallet deactivated, unless asked; those are marked', async () => {
      const deactivated = (name: string) => name === 'hekaDeactivated'
      vi.mocked(tenantAgent.dids.getCreatedDids).mockResolvedValue([
        didRecordStub({
          did: 'did:hedera:testnet:active',
          didDocument: new DidDocument({ id: 'did:hedera:testnet:active' }),
        }),
        didRecordStub({
          did: 'did:hedera:testnet:retired',
          didDocument: new DidDocument({ id: 'did:hedera:testnet:retired' }),
          getTag: deactivated,
        }),
      ])

      const active = await didService.find(tenantAgent, { own: true, method: 'hedera' })
      const all = await didService.find(tenantAgent, { own: true, method: 'hedera', includeDeactivated: true })

      expect(active.map(({ id }) => id)).toEqual(['did:hedera:testnet:active'])
      expect(all.map(({ id }) => id)).toEqual(['did:hedera:testnet:active', 'did:hedera:testnet:retired'])
      expect(all.map(({ deactivated }) => deactivated)).toEqual([undefined, true])
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

    test('marks a DID deactivated on its ledger', async () => {
      vi.mocked(tenantAgent.dids.resolve).mockResolvedValue(
        didResolutionResultStub({ didDocument: { id: 'did:indybesu:x' }, didDocumentMetadata: { deactivated: true } }),
      )

      expect((await didService.get(tenantAgent, 'did:indybesu:x')).deactivated).toBe(true)
    })

    test('marks an own DID the wallet deactivated (resolved from its record, without metadata)', async () => {
      vi.mocked(tenantAgent.dids.resolve).mockResolvedValue(
        didResolutionResultStub({ didDocument: { id: 'did:hedera:x' } }),
      )
      vi.mocked(tenantAgent.dids.getCreatedDids).mockResolvedValue([
        didRecordStub({ did: 'did:hedera:x', getTag: (name: string) => name === 'hekaDeactivated' }),
      ])

      const result = await didService.get(tenantAgent, 'did:hedera:x')

      expect(result.deactivated).toBe(true)
      expect(tenantAgent.dids.getCreatedDids).toHaveBeenCalledWith({ did: 'did:hedera:x' })
    })

    test('an active DID has no deactivated flag', async () => {
      vi.mocked(tenantAgent.dids.resolve).mockResolvedValue(
        didResolutionResultStub({ didDocument: { id: 'did:hedera:x' } }),
      )

      expect(await didService.get(tenantAgent, 'did:hedera:x')).not.toHaveProperty('deactivated')
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

    test('returns the capabilities of every configured method, and of those only', () => {
      const capable = ['hedera', 'indybesu']
      vi.mocked(didRegistrarService.supportsUpdate).mockImplementation((method) => capable.includes(method))
      vi.mocked(didRegistrarService.supportsDeactivate).mockImplementation((method) => capable.includes(method))
      vi.mocked(didRegistrarService.supportsController).mockImplementation((method) => method === 'hedera')
      const makeService = (didMethods: string[]) =>
        new DidService(
          agent,
          em,
          logger,
          didRegistrarService,
          createMock<ConfigType<typeof AgentConfig>>({ didMethods }),
          new AuthorizationService({ enabled: true }),
          walletLockService,
        )

      expect(makeService(['indy', 'key', 'hedera']).getMethods()).toEqual({
        methods: ['indy', 'key', 'hedera'],
        capabilities: {
          indy: { update: false, deactivate: false, controller: false },
          key: { update: false, deactivate: false, controller: false },
          hedera: { update: true, deactivate: true, controller: true },
        },
      })
      expect(makeService(['key', 'indybesu']).getMethods().capabilities).toEqual({
        key: { update: false, deactivate: false, controller: false },
        indybesu: { update: true, deactivate: true, controller: false },
      })
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
      new DidService(
        agent,
        em,
        logger,
        didRegistrarService,
        agentConfig,
        new AuthorizationService({ enabled }),
        walletLockService,
      )

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

    test('rejects a role that cannot create a public DID when the role model is enabled', async () => {
      vi.mocked(em.findOneOrFail).mockResolvedValue(
        entityStub<Wallet>({ id: 'Organization_org-1', publicDid: undefined }),
      )

      await expect(didService.create(makeAuthInfo(Role.OrgManager, 'Organization_org-1', 'org-1'), {})).rejects.toThrow(
        ForbiddenException,
      )
      expect(didRegistrarService.createDid).not.toHaveBeenCalled()
    })

    describe('Verifier (role model enabled)', () => {
      const verifierWallet = 'Verifier_user-1_in_Organization_org-1'

      test('creates a self-controlled did:key, without looking for a controller', async () => {
        vi.mocked(em.findOneOrFail).mockResolvedValue(entityStub<Wallet>({ id: verifierWallet, publicDid: undefined }))
        vi.mocked(didRegistrarService.createDid).mockResolvedValue(didDocumentStub({ id: 'did:key:verifier' }))

        const result = await didService.create(makeAuthInfo(Role.Verifier, verifierWallet, 'org-1'), {})

        expect(result.id).toBe('did:key:verifier')
        expect(didRegistrarService.createDid).toHaveBeenCalledWith('tenant-1', 'key', { namespace: 'test-ns' })
        expect(em.findOne).not.toHaveBeenCalled()
      })

      test.each(['hedera', 'indy', 'indybesu'])('may not create a %s DID (ledger write)', async (method) => {
        vi.mocked(em.findOneOrFail).mockResolvedValue(
          entityStub<Wallet>({ id: verifierWallet, publicDid: 'did:key:verifier' }),
        )

        await expect(
          didService.create(makeAuthInfo(Role.Verifier, verifierWallet, 'org-1'), { method }),
        ).rejects.toThrow(`Role 'Verifier' can only create did:key DIDs, not '${method}'`)
        expect(didRegistrarService.createDid).not.toHaveBeenCalled()
      })

      test('has no such limit with the role model disabled', async () => {
        vi.mocked(em.findOneOrFail).mockResolvedValue(
          entityStub<Wallet>({ id: verifierWallet, publicDid: 'did:key:verifier' }),
        )
        vi.mocked(didRegistrarService.createDid).mockResolvedValue(didDocumentStub({ id: 'did:hedera:testnet:v' }))

        const result = await makeService(false).create(makeAuthInfo(Role.Verifier, verifierWallet, 'org-1'), {
          method: 'hedera',
        })

        expect(result.id).toBe('did:hedera:testnet:v')
      })
    })

    test('returns 409 when the wallet already has its main-method DID', async () => {
      vi.mocked(em.findOneOrFail).mockResolvedValue(
        entityStub<Wallet>({ id: 'Issuer_user-1_in_Organization_org-1', publicDid: 'did:key:existing' }),
      )

      await expect(
        didService.create(makeAuthInfo(Role.Issuer, 'Issuer_user-1_in_Organization_org-1', 'org-1'), {}),
      ).rejects.toThrow(ConflictException)
      expect(em.findOne).not.toHaveBeenCalled()
    })

    describe('DID controller (role model enabled)', () => {
      let controllerTenantAgent: TenantAgent

      beforeEach(() => {
        // Only hedera can set a controller other than the DID itself
        vi.mocked(didRegistrarService.supportsController).mockImplementation((method) => method === 'hedera')
        controllerTenantAgent = createMock<TenantAgent>({ dids: { getCreatedDids: vi.fn().mockResolvedValue([]) } })
        Object.assign(agent, {
          modules: {
            tenants: {
              withTenantAgent: vi.fn(
                async (_options: unknown, callback: (tenantAgent: TenantAgent) => Promise<void>) => {
                  await callback(controllerTenantAgent)
                },
              ),
            },
          },
        })
        vi.mocked(didRegistrarService.createDid).mockResolvedValue(didDocumentStub({ id: 'did:hedera:testnet:new' }))
      })

      test.each([
        [Role.OrgAdmin, 'Organization_org-1', 'Administration'],
        [Role.Issuer, 'Issuer_user-1_in_Organization_org-1', 'Organization_org-1'],
      ])('%s is controlled by the hedera DID of %s', async (role, walletId, controllerWalletId) => {
        vi.mocked(em.findOneOrFail).mockResolvedValue(entityStub<Wallet>({ id: walletId, publicDid: 'did:key:own' }))
        vi.mocked(em.findOne).mockResolvedValue(
          entityStub<Wallet>({ id: controllerWalletId, tenantId: 'controller-tenant' }),
        )
        vi.mocked(controllerTenantAgent.dids.getCreatedDids).mockResolvedValue([
          didRecordStub({ did: 'did:hedera:testnet:controller' }),
        ])

        await didService.create(makeAuthInfo(role, walletId, 'org-1'), { method: 'hedera' })

        expect(em.findOne).toHaveBeenCalledWith(Wallet, { id: controllerWalletId })
        expect(agent.modules.tenants.withTenantAgent).toHaveBeenCalledWith(
          { tenantId: 'controller-tenant' },
          expect.any(Function),
        )
        expect(controllerTenantAgent.dids.getCreatedDids).toHaveBeenCalledWith({ method: 'hedera' })
        // The DID is created in the caller's own tenant, with the controller in its DID document
        expect(didRegistrarService.createDid).toHaveBeenCalledWith('tenant-1', 'hedera', {
          namespace: 'test-ns',
          controller: 'did:hedera:testnet:controller',
        })
      })

      test('a deactivated DID of the controller wallet is never the controller', async () => {
        vi.mocked(em.findOneOrFail).mockResolvedValue(
          entityStub<Wallet>({ id: 'Organization_org-1', publicDid: 'did:key:own' }),
        )
        vi.mocked(em.findOne).mockResolvedValue(entityStub<Wallet>({ id: 'Administration', tenantId: 'admin-tenant' }))
        const retired = didRecordStub({
          did: 'did:hedera:testnet:retired',
          createdAt: new Date('2026-01-01'),
          getTag: (name: string) => name === 'hekaDeactivated',
        })
        vi.mocked(controllerTenantAgent.dids.getCreatedDids).mockResolvedValue([
          retired,
          didRecordStub({ did: 'did:hedera:testnet:active', createdAt: new Date('2026-02-01') }),
        ])

        await didService.create(makeAuthInfo(Role.OrgAdmin, 'Organization_org-1', 'org-1'), { method: 'hedera' })

        expect(didRegistrarService.createDid).toHaveBeenCalledWith('tenant-1', 'hedera', {
          namespace: 'test-ns',
          controller: 'did:hedera:testnet:active',
        })

        // Without an active one the controller is missing (422)
        vi.mocked(controllerTenantAgent.dids.getCreatedDids).mockResolvedValue([retired])
        await expect(
          didService.create(makeAuthInfo(Role.OrgAdmin, 'Organization_org-1', 'org-1'), { method: 'hedera' }),
        ).rejects.toThrow(UnprocessableEntityException)
      })

      test('returns 422 until the controller wallet has a DID of the same method', async () => {
        vi.mocked(em.findOneOrFail).mockResolvedValue(
          entityStub<Wallet>({ id: 'Organization_org-1', publicDid: 'did:key:own' }),
        )
        vi.mocked(em.findOne).mockResolvedValue(entityStub<Wallet>({ id: 'Administration', tenantId: 'admin-tenant' }))

        await expect(
          didService.create(makeAuthInfo(Role.OrgAdmin, 'Organization_org-1', 'org-1'), { method: 'hedera' }),
        ).rejects.toThrow(UnprocessableEntityException)
        expect(didRegistrarService.createDid).not.toHaveBeenCalled()
      })

      test('returns 422 when the controller wallet does not exist yet', async () => {
        vi.mocked(em.findOneOrFail).mockResolvedValue(
          entityStub<Wallet>({ id: 'Organization_org-1', publicDid: 'did:key:own' }),
        )
        vi.mocked(em.findOne).mockResolvedValue(null)

        await expect(
          didService.create(makeAuthInfo(Role.OrgAdmin, 'Organization_org-1', 'org-1'), { method: 'hedera' }),
        ).rejects.toThrow(UnprocessableEntityException)
        expect(agent.modules.tenants.withTenantAgent).not.toHaveBeenCalled()
      })

      test('an Admin DID is self-controlled', async () => {
        vi.mocked(em.findOneOrFail).mockResolvedValue(
          entityStub<Wallet>({ id: 'Administration', publicDid: 'did:key:own' }),
        )

        await didService.create(makeAuthInfo(Role.Admin, 'Administration'), { method: 'hedera' })

        expect(em.findOne).not.toHaveBeenCalled()
        expect(didRegistrarService.createDid).toHaveBeenCalledWith('tenant-1', 'hedera', {
          namespace: 'test-ns',
          controller: undefined,
        })
      })

      test.each(['key', 'indy'])(
        'a %s DID cannot have another controller, so it is created without one',
        async (method) => {
          vi.mocked(em.findOneOrFail).mockResolvedValue(
            entityStub<Wallet>({ id: 'Issuer_user-1_in_Organization_org-1', publicDid: undefined }),
          )

          await didService.create(makeAuthInfo(Role.Issuer, 'Issuer_user-1_in_Organization_org-1', 'org-1'), {
            method,
          })

          expect(em.findOne).not.toHaveBeenCalled()
          expect(didRegistrarService.createDid).toHaveBeenCalledWith('tenant-1', method, {
            namespace: 'test-ns',
            controller: undefined,
          })
        },
      )

      test('with the role model disabled no controller is set', async () => {
        vi.mocked(em.findOneOrFail).mockResolvedValue(
          entityStub<Wallet>({ id: 'User_user-1', publicDid: 'did:key:own' }),
        )

        await makeService(false).create(makeAuthInfo(Role.User, 'User_user-1'), { method: 'hedera' })

        expect(em.findOne).not.toHaveBeenCalled()
        expect(didRegistrarService.createDid).toHaveBeenCalledWith('tenant-1', 'hedera', {
          namespace: 'test-ns',
          controller: undefined,
        })
      })
    })

    test('an unsupported method is rejected by the registrar', async () => {
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

    test('with the role model disabled the controller check is skipped', async () => {
      const service = makeService(false)
      const wallet = entityStub<Wallet>({ id: 'User_user-1', publicDid: undefined })
      vi.mocked(em.findOneOrFail).mockResolvedValue(wallet)
      vi.mocked(didRegistrarService.createDid).mockResolvedValue(didDocumentStub({ id: 'did:key:user' }))

      await service.create(makeAuthInfo(Role.User, 'User_user-1'), {})

      expect(em.findOne).not.toHaveBeenCalled()
      expect(wallet.publicDid).toBe('did:key:user')
    })

    describe('main DID across instances (8.1, 8.2)', () => {
      test('claims public_did only while it is empty', async () => {
        vi.mocked(em.findOneOrFail).mockResolvedValue(
          entityStub<Wallet>({ id: 'Administration', publicDid: undefined }),
        )
        vi.mocked(didRegistrarService.createDid).mockResolvedValue(didDocumentStub({ id: 'did:key:root' }))

        await didService.create(makeAuthInfo(Role.Admin, 'Administration'), {})

        expect(em.nativeUpdate).toHaveBeenCalledWith(
          Wallet,
          { id: 'Administration', publicDid: null },
          { publicDid: 'did:key:root' },
        )
      })

      test('another instance set public_did first: the new DID record is deleted and the call gets 409', async () => {
        const wallet = entityStub<Wallet>({ id: 'Administration', tenantId: 'tenant-1', publicDid: undefined })
        vi.mocked(em.findOneOrFail)
          .mockResolvedValueOnce(wallet)
          .mockResolvedValueOnce(entityStub<Wallet>({ id: 'Administration', publicDid: 'did:key:other-instance' }))
        vi.mocked(didRegistrarService.createDid).mockResolvedValue(didDocumentStub({ id: 'did:key:lost' }))
        vi.mocked(em.nativeUpdate).mockResolvedValue(0)
        const didRecord = didRecordStub({ did: 'did:key:lost' })
        const didRepository = { findCreatedDid: vi.fn().mockResolvedValue(didRecord), delete: vi.fn() }
        const lockTenantAgent = createMock<TenantAgent>({
          dependencyManager: { resolve: vi.fn().mockReturnValue(didRepository) },
          context: {},
        })
        Object.assign(agent, {
          modules: {
            tenants: {
              withTenantAgent: vi.fn(async (_options: unknown, callback: (t: TenantAgent) => Promise<void>) => {
                await callback(lockTenantAgent)
              }),
            },
          },
        })

        await expect(didService.create(makeAuthInfo(Role.Admin, 'Administration'), {})).rejects.toThrow(
          'The wallet already contains created public DID: did:key:other-instance',
        )
        expect(didRepository.findCreatedDid).toHaveBeenCalledWith(expect.anything(), 'did:key:lost')
        expect(didRepository.delete).toHaveBeenCalledWith(expect.anything(), didRecord)
        expect(wallet.publicDid).toBeUndefined()
      })

      test('main-DID creation for different wallets does not wait in one queue', async () => {
        vi.mocked(em.findOneOrFail).mockImplementation(((_entity: unknown, where: { id: string }) =>
          Promise.resolve(entityStub<Wallet>({ id: where.id, publicDid: undefined }))) as never)
        let pending = 0
        let maxPending = 0
        vi.mocked(didRegistrarService.createDid).mockImplementation((tenantId) => {
          pending++
          maxPending = Math.max(maxPending, pending)
          return new Promise((resolve) =>
            setTimeout(() => {
              pending--
              resolve(didDocumentStub({ id: `did:key:${tenantId}` }))
            }, 10),
          )
        })

        const service = makeService(false)
        await Promise.all([
          service.create({ ...makeAuthInfo(Role.Admin, 'Administration'), tenantId: 'tenant-a' }, {}),
          service.create({ ...makeAuthInfo(Role.User, 'User_user-2'), tenantId: 'tenant-b' }, {}),
        ])

        expect(maxPending).toBe(2)
      })
    })
  })

  describe('findOwnDid', () => {
    test("returns the wallet's oldest DID of the method, ignoring the shared Indy endorser DID", async () => {
      vi.mocked(tenantAgent.dids.getCreatedDids).mockResolvedValue([
        didRecordStub({ did: 'endorser-did', createdAt: new Date('2026-01-01') }),
        didRecordStub({ did: 'did:indy:newer', createdAt: new Date('2026-03-01') }),
        didRecordStub({ did: 'did:indy:older', createdAt: new Date('2026-02-01') }),
      ])

      expect(await didService.findOwnDid(tenantAgent, 'indy')).toBe('did:indy:older')
      expect(tenantAgent.dids.getCreatedDids).toHaveBeenCalledWith({ method: 'indy' })
    })

    test('skips a DID the wallet deactivated, so a new one is created in its place', async () => {
      vi.mocked(tenantAgent.dids.getCreatedDids).mockResolvedValue([
        didRecordStub({
          did: 'did:hedera:retired',
          createdAt: new Date('2026-01-01'),
          getTag: (name: string) => name === 'hekaDeactivated',
        }),
        didRecordStub({ did: 'did:hedera:active', createdAt: new Date('2026-02-01') }),
      ])

      expect(await didService.findOwnDid(tenantAgent, 'hedera')).toBe('did:hedera:active')
    })

    test('is undefined when the wallet has no DID of the method', async () => {
      vi.mocked(tenantAgent.dids.getCreatedDids).mockResolvedValue([didRecordStub({ did: 'endorser-did' })])

      expect(await didService.findOwnDid(tenantAgent, 'indy')).toBeUndefined()
    })
  })

  describe('update and deactivate', () => {
    const did = 'did:hedera:testnet:z6Mkowner_0.0.1'
    const rootKey = `${did}#did-root-key`
    let didRecord: DidRecord
    let didRepository: { update: ReturnType<typeof vi.fn> }
    let hederaRegistrar: DidRegistrar

    const makeAuthInfo = (role: Role, walletId = 'Organization_org-1'): AuthInfo => ({
      userId: 'user-1',
      user: entityStub<User>({}),
      userName: 'testuser',
      role,
      orgId: 'org-1',
      walletId,
      tenantId: 'tenant-1',
    })
    const orgAdmin = makeAuthInfo(Role.OrgAdmin)

    const currentDocument = () =>
      new DidDocument({
        context: ['https://www.w3.org/ns/did/v1'],
        id: did,
        verificationMethod: [
          new VerificationMethod({ id: rootKey, type: 'Ed25519VerificationKey2020', controller: did }),
          new VerificationMethod({ id: `${did}#key-1`, type: 'Ed25519VerificationKey2020', controller: did }),
        ],
        authentication: [rootKey],
        assertionMethod: [rootKey, `${did}#key-1`],
        service: [new DidDocumentService({ id: `${did}#svc-1`, type: 'LinkedDomains', serviceEndpoint: 'https://a' })],
      })

    const ledgerResolution = (didDocumentMetadata: Record<string, unknown> = {}) =>
      didResolutionResultStub({ didDocument: currentDocument(), didDocumentMetadata })

    beforeEach(() => {
      didRecord = new DidRecord({ did, role: DidDocumentRole.Created, didDocument: currentDocument() })
      didRepository = { update: vi.fn() }
      Object.assign(tenantAgent, {
        context: {},
        dependencyManager: { resolve: vi.fn().mockReturnValue(didRepository) },
      })
      vi.mocked(tenantAgent.dids.getCreatedDids).mockResolvedValue([didRecord])
      vi.mocked(tenantAgent.dids.resolve).mockResolvedValue(ledgerResolution())
      hederaRegistrar = { protectedKeyFragment: '#did-root-key' } as DidRegistrar
      vi.mocked(didRegistrarService.getUpdatingDidRegistrar).mockReturnValue(hederaRegistrar)
      vi.mocked(didRegistrarService.updateDid).mockResolvedValue(currentDocument())
      vi.mocked(didRegistrarService.deactivateDid).mockResolvedValue(new DidDocument({ id: did }))
    })

    describe('update', () => {
      test('runs under the wallet lock and passes the operations, checked against the ledger document', async () => {
        const result = await didService.update(orgAdmin, tenantAgent, did, {
          addServices: [{ id: '#svc-2', type: 'LinkedDomains', serviceEndpoint: 'https://example.com' }],
          removeVerificationMethods: ['#key-1'],
        })

        expect(result.id).toBe(did)
        expect(walletLockService.runExclusive).toHaveBeenCalledWith('Organization_org-1', 60, expect.any(Function))
        expect(tenantAgent.dids.resolve).toHaveBeenCalledWith(did, { useCache: false, useLocalCreatedDidRecord: false })
        expect(didRegistrarService.getUpdatingDidRegistrar).toHaveBeenCalledWith('hedera', 'update')
        expect(didRegistrarService.updateDid).toHaveBeenCalledWith(tenantAgent, 'hedera', {
          did,
          currentDidDocument: expect.objectContaining({ id: did }),
          addServices: [{ id: '#svc-2', type: 'LinkedDomains', serviceEndpoint: 'https://example.com' }],
          removeServices: [],
          addVerificationMethods: [],
          removeVerificationMethods: ['#key-1'],
        })
      })

      test('gives new keys the lowest unused #key-<n> (case-insensitive) and the default purposes', async () => {
        await didService.update(orgAdmin, tenantAgent, did, {
          addVerificationMethods: [{}, { id: '#KEY-2' }, { purposes: [] }],
        })

        expect(vi.mocked(didRegistrarService.updateDid).mock.calls[0][2].addVerificationMethods).toEqual([
          { id: '#key-3', purposes: ['assertionMethod', 'authentication'] },
          { id: '#KEY-2', purposes: ['assertionMethod', 'authentication'] },
          { id: '#key-4', purposes: [] },
        ])
      })

      test.each([
        [{ removeVerificationMethods: ['#did-root-key'] }],
        [{ removeVerificationMethods: ['#DID-ROOT-KEY'] }],
        [{ addVerificationMethods: [{ id: '#did-root-key' }] }],
        [{ addServices: [{ id: '#Did-Root-Key', type: 'LinkedDomains', serviceEndpoint: 'https://a' }] }],
      ])('rejects any operation on the key that controls the DID: %j', async (req) => {
        await expect(didService.update(orgAdmin, tenantAgent, did, req)).rejects.toThrow(
          'is the key that controls the DID and cannot be changed',
        )
        expect(didRegistrarService.updateDid).not.toHaveBeenCalled()
      })

      test('did:indybesu: the owner key #KEY-1 is protected in any case (422)', async () => {
        const indyBesuDid = 'did:indybesu:testnet:0x2c7536E3605D9C16a7a3D7b1898e529396a65c23'
        vi.mocked(didRegistrarService.getUpdatingDidRegistrar).mockReturnValue({
          protectedKeyFragment: '#KEY-1',
        } as DidRegistrar)
        vi.mocked(tenantAgent.dids.getCreatedDids).mockResolvedValue([
          new DidRecord({ did: indyBesuDid, role: DidDocumentRole.Created }),
        ])

        for (const req of [{ removeVerificationMethods: ['#key-1'] }, { addVerificationMethods: [{ id: '#Key-1' }] }]) {
          await expect(didService.update(orgAdmin, tenantAgent, indyBesuDid, req)).rejects.toThrow(
            'is the key that controls the DID and cannot be changed',
          )
        }
        expect(didRegistrarService.getUpdatingDidRegistrar).toHaveBeenCalledWith('indybesu', 'update')
        expect(didRegistrarService.updateDid).not.toHaveBeenCalled()
      })

      test.each([
        [{ addServices: [{ id: '#svc-1', type: 'LinkedDomains', serviceEndpoint: 'https://a' }] }, 'already exists'],
        [{ addVerificationMethods: [{ id: '#Key-1' }] }, 'already exists'],
        [{ addVerificationMethods: [{ id: '#key-9' }, { id: '#key-9' }] }, 'already exists'],
        [{ removeServices: ['#svc-9'] }, 'Service #svc-9 does not exist'],
        [{ removeServices: ['#key-1'] }, 'Service #key-1 does not exist'],
        [{ removeVerificationMethods: ['#svc-1'] }, 'Verification method #svc-1 does not exist'],
        [{ removeVerificationMethods: ['#key-1', '#key-1'] }, 'is named more than once'],
      ])('rejects %j with 422 (%s)', async (req, message) => {
        const update = didService.update(orgAdmin, tenantAgent, did, req)

        await expect(update).rejects.toThrow(UnprocessableEntityException)
        await expect(update).rejects.toThrow(message)
        expect(didRegistrarService.updateDid).not.toHaveBeenCalled()
      })

      test.each([[{}], [{ addServices: [], removeServices: [] }], [{ removeServices: Array(11).fill('#svc-1') }]])(
        'rejects %j: between 1 and 10 operations (400)',
        async (req) => {
          await expect(didService.update(orgAdmin, tenantAgent, did, req)).rejects.toThrow(BadRequestException)
          expect(walletLockService.runExclusive).not.toHaveBeenCalled()
        },
      )

      test('a method that cannot update DIDs is rejected by the registrar service (422)', async () => {
        vi.mocked(didRegistrarService.getUpdatingDidRegistrar).mockImplementation(() => {
          throw new UnprocessableEntityException('did:key DIDs are immutable and cannot be updated or deactivated')
        })
        didRecord = new DidRecord({ did: 'did:key:z6Mk1', role: DidDocumentRole.Created })
        vi.mocked(tenantAgent.dids.getCreatedDids).mockResolvedValue([didRecord])

        await expect(
          didService.update(orgAdmin, tenantAgent, 'did:key:z6Mk1', { removeServices: ['#svc-1'] }),
        ).rejects.toThrow('immutable')
        expect(didRegistrarService.getUpdatingDidRegistrar).toHaveBeenCalledWith('key', 'update')
        expect(tenantAgent.dids.resolve).not.toHaveBeenCalled()
      })

      test('the shared Indy endorser DID is never changed (403)', async () => {
        await expect(
          didService.update(orgAdmin, tenantAgent, 'endorser-did', { removeServices: ['#svc-1'] }),
        ).rejects.toThrow(ForbiddenException)
        expect(tenantAgent.dids.getCreatedDids).not.toHaveBeenCalled()
      })

      test("a DID that is not the wallet's own is not found (404)", async () => {
        vi.mocked(tenantAgent.dids.getCreatedDids).mockResolvedValue([])

        await expect(didService.update(orgAdmin, tenantAgent, did, { removeServices: ['#svc-1'] })).rejects.toThrow(
          new NotFoundException('DID not found in this wallet'),
        )
        expect(tenantAgent.dids.getCreatedDids).toHaveBeenCalledWith({ did })
      })

      test('a Verifier cannot change DIDs (403); with the role model disabled it can', async () => {
        const verifier = makeAuthInfo(Role.Verifier)

        await expect(didService.update(verifier, tenantAgent, did, { removeServices: ['#svc-1'] })).rejects.toThrow(
          ForbiddenException,
        )
        const unrestricted = new DidService(
          agent,
          em,
          logger,
          didRegistrarService,
          agentConfig,
          new AuthorizationService({ enabled: false }),
          walletLockService,
        )
        await expect(
          unrestricted.update(verifier, tenantAgent, did, { removeServices: ['#svc-1'] }),
        ).resolves.toBeDefined()
      })

      test('fails with 503 when the ledger cannot be read, instead of trusting the wallet copy', async () => {
        vi.mocked(tenantAgent.dids.resolve).mockResolvedValue(
          didResolutionResultStub({ didResolutionMetadata: { error: 'notFound', message: 'mirror node: ECONNRESET' } }),
        )

        const update = didService.update(orgAdmin, tenantAgent, did, { removeServices: ['#svc-1'] })

        await expect(update).rejects.toThrow(ServiceUnavailableException)
        await expect(update).rejects.toThrow('Unable to read the current DID document from its ledger; retry later')
        await expect(update).rejects.not.toThrow('ECONNRESET')
        expect(didRegistrarService.updateDid).not.toHaveBeenCalled()
      })

      describe('private keys of removed verification methods', () => {
        const keyBefore = [
          { kmsKeyId: 'root-kms', didDocumentRelativeKeyId: '#did-root-key' },
          { kmsKeyId: 'kms-1', didDocumentRelativeKeyId: '#key-1' },
          { kmsKeyId: 'kms-2', didDocumentRelativeKeyId: '#key-2' },
        ]
        // The document after the update, as the registrar returns it and stores it in the DID record
        const documentWithout = (...fragments: string[]) => {
          const document = currentDocument()
          document.verificationMethod = document.verificationMethod!.filter(
            ({ id }) => !fragments.some((fragment) => id.endsWith(fragment)),
          )
          return document
        }
        const recordAfter = (didDocument: DidDocument, keys: typeof keyBefore) =>
          new DidRecord({ did, role: DidDocumentRole.Created, didDocument, keys })

        beforeEach(() => {
          didRecord.keys = [...keyBefore]
          Object.assign(tenantAgent, { kms: { deleteKey: vi.fn().mockResolvedValue(true) } })
        })

        test('are deleted from the KMS after a successful update; other keys stay', async () => {
          const after = documentWithout('#key-1')
          vi.mocked(didRegistrarService.updateDid).mockResolvedValue(after)
          vi.mocked(tenantAgent.dids.getCreatedDids)
            .mockResolvedValueOnce([didRecord])
            .mockResolvedValueOnce([recordAfter(after, [keyBefore[0], keyBefore[2]])])

          await didService.update(orgAdmin, tenantAgent, did, { removeVerificationMethods: ['#key-1'] })

          expect(tenantAgent.kms.deleteKey).toHaveBeenCalledExactlyOnceWith({ keyId: 'kms-1' })
        })

        test('an update without removed verification methods deletes nothing', async () => {
          await didService.update(orgAdmin, tenantAgent, did, { removeServices: ['#svc-1'] })

          expect(tenantAgent.kms.deleteKey).not.toHaveBeenCalled()
        })

        test.each([
          ['the updated document still has the fragment', currentDocument(), [keyBefore[0], keyBefore[2]]],
          ['the DID record still maps the key', documentWithout('#key-1'), keyBefore],
          [
            'the key also controls the DID',
            documentWithout('#key-1'),
            [keyBefore[0], { kmsKeyId: 'kms-1', didDocumentRelativeKeyId: '#did-root-key' }],
          ],
        ])('a key is kept when %s', async (_case, after, keysAfter) => {
          vi.mocked(didRegistrarService.updateDid).mockResolvedValue(after)
          vi.mocked(tenantAgent.dids.getCreatedDids)
            .mockResolvedValueOnce([didRecord])
            .mockResolvedValueOnce([recordAfter(after, keysAfter)])

          await didService.update(orgAdmin, tenantAgent, did, { removeVerificationMethods: ['#key-1'] })

          expect(tenantAgent.kms.deleteKey).not.toHaveBeenCalled()
        })

        describe('after a failed update', () => {
          const updateError = new InternalServerErrorException('DID document was not updated: timeout')
          const ledgerAfter = (didDocument: DidDocument | null, didDocumentMetadata: Record<string, unknown> = {}) =>
            didResolutionResultStub({ didDocument, didDocumentMetadata })
          // What the method wrapper left in the wallet: did:hedera takes the ledger document but keeps every mapping
          let recordAfterFailure: DidRecord

          const failingUpdate = (
            req: Parameters<DidService['update']>[3] = { removeVerificationMethods: ['#key-1'] },
          ) => didService.update(orgAdmin, tenantAgent, did, req)

          beforeEach(() => {
            vi.mocked(didRegistrarService.updateDid).mockRejectedValue(updateError)
            recordAfterFailure = recordAfter(currentDocument(), [...keyBefore])
            vi.mocked(tenantAgent.dids.getCreatedDids)
              .mockResolvedValueOnce([didRecord])
              .mockResolvedValue([recordAfterFailure])
          })

          test('deletes the private key of a removal the ledger shows, drops its mapping and rethrows the error', async () => {
            vi.mocked(tenantAgent.dids.resolve)
              .mockResolvedValueOnce(ledgerResolution())
              .mockResolvedValueOnce(ledgerAfter(documentWithout('#key-1')))
            const childLogger = createMock<Logger>()
            vi.mocked(logger.child).mockReturnValue(childLogger)

            await expect(failingUpdate()).rejects.toBe(updateError)

            expect(tenantAgent.dids.resolve).toHaveBeenLastCalledWith(did, {
              useCache: false,
              useLocalCreatedDidRecord: false,
            })
            expect(tenantAgent.kms.deleteKey).toHaveBeenCalledExactlyOnceWith({ keyId: 'kms-1' })
            expect(didRepository.update).toHaveBeenCalledWith(tenantAgent.context, recordAfterFailure)
            expect(recordAfterFailure.keys).toEqual([keyBefore[0], keyBefore[2]])
            expect(recordAfterFailure.didDocument?.verificationMethod?.map(({ id }) => id)).toEqual([rootKey])
            expect(childLogger.warn).toHaveBeenCalledWith(
              'The update failed, but the ledger no longer shows 1 removed verification method(s); deleting their private keys',
            )
            const logged = JSON.stringify([
              ...vi.mocked(childLogger.warn).mock.calls,
              ...vi.mocked(childLogger.info).mock.calls,
            ])
            expect(logged).not.toContain('kms-')
          })

          test('keeps the key of a removal the ledger does not show, and leaves the record as it is', async () => {
            // The second read still shows #key-1
            await expect(failingUpdate()).rejects.toBe(updateError)

            expect(tenantAgent.dids.resolve).toHaveBeenCalledTimes(2)
            expect(tenantAgent.kms.deleteKey).not.toHaveBeenCalled()
            expect(didRepository.update).not.toHaveBeenCalled()
            expect(recordAfterFailure.keys).toEqual(keyBefore)
          })

          test.each([
            ['the ledger read throws', () => Promise.reject(new Error('mirror node: ECONNRESET'))],
            ['the ledger shows no document', () => Promise.resolve(ledgerAfter(null))],
            [
              'the ledger shows the DID deactivated',
              () => Promise.resolve(ledgerAfter(documentWithout('#key-1'), { deactivated: true })),
            ],
          ])('deletes nothing and rethrows the original error when %s', async (_case, secondRead) => {
            vi.mocked(tenantAgent.dids.resolve)
              .mockResolvedValueOnce(ledgerResolution())
              .mockImplementationOnce(secondRead)

            await expect(failingUpdate()).rejects.toBe(updateError)

            expect(tenantAgent.kms.deleteKey).not.toHaveBeenCalled()
            expect(didRepository.update).not.toHaveBeenCalled()
          })

          test('deletes nothing and rethrows the original error when the DID record cannot be updated', async () => {
            vi.mocked(tenantAgent.dids.resolve)
              .mockResolvedValueOnce(ledgerResolution())
              .mockResolvedValueOnce(ledgerAfter(documentWithout('#key-1')))
            didRepository.update.mockRejectedValue(new Error('storage error'))

            await expect(failingUpdate()).rejects.toBe(updateError)

            expect(tenantAgent.kms.deleteKey).not.toHaveBeenCalled()
          })

          test('never deletes the key that controls the DID, even when the ledger shows it backing nothing', async () => {
            // #key-1 shares the root key's KMS key, and the ledger shows neither of them
            const shared = [keyBefore[0], { kmsKeyId: 'root-kms', didDocumentRelativeKeyId: '#key-1' }, keyBefore[2]]
            didRecord.keys = [...shared]
            recordAfterFailure.keys = [...shared]
            vi.mocked(tenantAgent.dids.resolve)
              .mockResolvedValueOnce(ledgerResolution())
              .mockResolvedValueOnce(ledgerAfter(documentWithout('#key-1', '#did-root-key')))

            await expect(failingUpdate()).rejects.toBe(updateError)

            expect(tenantAgent.kms.deleteKey).not.toHaveBeenCalled()
            expect(recordAfterFailure.keys).toEqual([keyBefore[0], keyBefore[2]])
          })

          test('keeps a key the DID record still maps under another verification method', async () => {
            const shared = [keyBefore[0], keyBefore[1], { kmsKeyId: 'kms-1', didDocumentRelativeKeyId: '#key-2' }]
            didRecord.keys = [...shared]
            recordAfterFailure.keys = [...shared]
            vi.mocked(tenantAgent.dids.resolve)
              .mockResolvedValueOnce(ledgerResolution())
              .mockResolvedValueOnce(ledgerAfter(documentWithout('#key-1')))

            await expect(failingUpdate()).rejects.toBe(updateError)

            expect(tenantAgent.kms.deleteKey).not.toHaveBeenCalled()
          })

          test('an update without removed verification methods does not read the ledger again', async () => {
            await expect(failingUpdate({ removeServices: ['#svc-1'] })).rejects.toBe(updateError)

            expect(tenantAgent.dids.resolve).toHaveBeenCalledTimes(1)
            expect(tenantAgent.kms.deleteKey).not.toHaveBeenCalled()
          })
        })

        test('a failed deletion does not fail the update and is logged without key ids', async () => {
          const after = documentWithout('#key-1')
          vi.mocked(didRegistrarService.updateDid).mockResolvedValue(after)
          vi.mocked(tenantAgent.dids.getCreatedDids)
            .mockResolvedValueOnce([didRecord])
            .mockResolvedValueOnce([recordAfter(after, [keyBefore[0], keyBefore[2]])])
          vi.mocked(tenantAgent.kms.deleteKey).mockRejectedValue(new Error('Key kms-1 could not be deleted'))
          const childLogger = createMock<Logger>()
          vi.mocked(logger.child).mockReturnValue(childLogger)

          const result = await didService.update(orgAdmin, tenantAgent, did, { removeVerificationMethods: ['#key-1'] })

          expect(result.id).toBe(did)
          expect(childLogger.warn).toHaveBeenCalledWith(
            'Could not delete 1 private key(s) of the removed verification methods',
          )
          expect(JSON.stringify(vi.mocked(childLogger.warn).mock.calls)).not.toContain('kms-1')
        })
      })

      test('a DID the wallet deactivated is not updated (409)', async () => {
        didRecord.setTag('hekaDeactivated', true)

        await expect(didService.update(orgAdmin, tenantAgent, did, { removeServices: ['#svc-1'] })).rejects.toThrow(
          ConflictException,
        )
        expect(didRegistrarService.updateDid).not.toHaveBeenCalled()
      })

      test('a DID deactivated on its ledger is not updated (409), and the wallet records it', async () => {
        vi.mocked(tenantAgent.dids.resolve).mockResolvedValue(ledgerResolution({ deactivated: true }))

        await expect(didService.update(orgAdmin, tenantAgent, did, { removeServices: ['#svc-1'] })).rejects.toThrow(
          ConflictException,
        )
        expect(didRegistrarService.updateDid).not.toHaveBeenCalled()
        expect(didRecord.getTag('hekaDeactivated')).toBe(true)
        expect(didRepository.update).toHaveBeenCalledWith(tenantAgent.context, didRecord)
      })
    })

    describe('deactivate', () => {
      test('deactivates through the registrar under the wallet lock and tags the DID record', async () => {
        const result = await didService.deactivate(orgAdmin, tenantAgent, did)

        expect(result).toEqual(expect.objectContaining({ id: did, deactivated: true }))
        expect(walletLockService.runExclusive).toHaveBeenCalledWith('Organization_org-1', 60, expect.any(Function))
        expect(didRegistrarService.getUpdatingDidRegistrar).toHaveBeenCalledWith('hedera', 'deactivate')
        expect(didRegistrarService.deactivateDid).toHaveBeenCalledWith(tenantAgent, 'hedera', did)
        expect(didRecord.getTag('hekaDeactivated')).toBe(true)
        expect(didRepository.update).toHaveBeenCalledWith(tenantAgent.context, didRecord)
      })

      test('a DID the wallet deactivated is returned without a ledger write (idempotent)', async () => {
        didRecord.setTag('hekaDeactivated', true)

        const result = await didService.deactivate(orgAdmin, tenantAgent, did)

        expect(result).toEqual(expect.objectContaining({ id: did, deactivated: true }))
        expect(didRegistrarService.deactivateDid).not.toHaveBeenCalled()
        expect(tenantAgent.dids.resolve).not.toHaveBeenCalled()
      })

      test('a DID deactivated on its ledger is tagged and returned without a second ledger write', async () => {
        vi.mocked(tenantAgent.dids.resolve).mockResolvedValue(ledgerResolution({ deactivated: true }))

        const result = await didService.deactivate(orgAdmin, tenantAgent, did)

        expect(result.deactivated).toBe(true)
        expect(didRegistrarService.deactivateDid).not.toHaveBeenCalled()
        expect(didRecord.getTag('hekaDeactivated')).toBe(true)
      })

      test('shares the checks of an update: endorser DID (403), foreign DID (404), method (422)', async () => {
        await expect(didService.deactivate(orgAdmin, tenantAgent, 'endorser-did')).rejects.toThrow(ForbiddenException)

        vi.mocked(tenantAgent.dids.getCreatedDids).mockResolvedValueOnce([])
        await expect(didService.deactivate(orgAdmin, tenantAgent, did)).rejects.toThrow(NotFoundException)

        vi.mocked(didRegistrarService.getUpdatingDidRegistrar).mockImplementation(() => {
          throw new UnprocessableEntityException('did:indy update and deactivation are not implemented yet')
        })
        await expect(didService.deactivate(orgAdmin, tenantAgent, did)).rejects.toThrow('not implemented yet')
        expect(didRegistrarService.deactivateDid).not.toHaveBeenCalled()
      })

      test('a failed ledger write leaves the record untagged', async () => {
        vi.mocked(didRegistrarService.deactivateDid).mockRejectedValue(
          new InternalServerErrorException('DID document was not deactivated: timeout'),
        )

        await expect(didService.deactivate(orgAdmin, tenantAgent, did)).rejects.toThrow('not deactivated')
        // The ledger was read again after the failure and still shows the DID active
        expect(tenantAgent.dids.resolve).toHaveBeenCalledTimes(2)
        expect(tenantAgent.dids.resolve).toHaveBeenLastCalledWith(did, {
          useCache: false,
          useLocalCreatedDidRecord: false,
        })
        expect(didRecord.getTag('hekaDeactivated')).toBeUndefined()
        expect(didRepository.update).not.toHaveBeenCalled()
      })

      test('a failed ledger write that reached the ledger (lost response) succeeds and tags the record', async () => {
        vi.mocked(didRegistrarService.deactivateDid).mockRejectedValue(
          new InternalServerErrorException('DID document was not deactivated: timeout'),
        )
        vi.mocked(tenantAgent.dids.resolve)
          .mockResolvedValueOnce(ledgerResolution())
          .mockResolvedValueOnce(ledgerResolution({ deactivated: true }))

        const result = await didService.deactivate(orgAdmin, tenantAgent, did)

        expect(result).toEqual(expect.objectContaining({ id: did, deactivated: true }))
        expect(walletLockService.runExclusive).toHaveBeenCalledOnce()
        expect(didRecord.getTag('hekaDeactivated')).toBe(true)
        expect(didRepository.update).toHaveBeenCalledWith(tenantAgent.context, didRecord)
      })

      test('a ledger that cannot be read after a failed write does not mask the original error', async () => {
        vi.mocked(didRegistrarService.deactivateDid).mockRejectedValue(
          new InternalServerErrorException('DID document was not deactivated: timeout'),
        )
        vi.mocked(tenantAgent.dids.resolve)
          .mockResolvedValueOnce(ledgerResolution())
          .mockRejectedValueOnce(new Error('mirror node unavailable'))

        const deactivation = didService.deactivate(orgAdmin, tenantAgent, did)

        await expect(deactivation).rejects.toThrow(InternalServerErrorException)
        await expect(deactivation).rejects.toThrow('DID document was not deactivated: timeout')
        expect(didRecord.getTag('hekaDeactivated')).toBeUndefined()
        expect(didRepository.update).not.toHaveBeenCalled()
      })

      test('a failed tag write after the ledger shows the deactivation does not mask the original error', async () => {
        vi.mocked(didRegistrarService.deactivateDid).mockRejectedValue(
          new InternalServerErrorException('DID document was not deactivated: timeout'),
        )
        vi.mocked(tenantAgent.dids.resolve)
          .mockResolvedValueOnce(ledgerResolution())
          .mockResolvedValueOnce(ledgerResolution({ deactivated: true }))
        didRepository.update.mockRejectedValue(new Error('storage unavailable'))
        const childLogger = createMock<Logger>()
        vi.mocked(logger.child).mockReturnValue(childLogger)

        await expect(didService.deactivate(orgAdmin, tenantAgent, did)).rejects.toThrow(
          'DID document was not deactivated: timeout',
        )
        expect(logger.child).toHaveBeenCalledWith('reconcileFailedDeactivation', { did })
        expect(childLogger.warn).toHaveBeenCalledWith(
          'Could not reconcile the failed deactivation: storage unavailable',
        )
      })
    })
  })
})
