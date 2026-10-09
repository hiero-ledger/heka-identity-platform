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
    // The wallet's `public_did` is still empty, so the claim succeeds
    vi.mocked(em.nativeUpdate).mockResolvedValue(1)
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

    test('is undefined when the wallet has no DID of the method', async () => {
      vi.mocked(tenantAgent.dids.getCreatedDids).mockResolvedValue([didRecordStub({ did: 'endorser-did' })])

      expect(await didService.findOwnDid(tenantAgent, 'indy')).toBeUndefined()
    })
  })
})
