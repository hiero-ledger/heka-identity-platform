import { createMock } from '@golevelup/ts-vitest'
import { EntityManager } from '@mikro-orm/core'
import { ConflictException, ForbiddenException, UnprocessableEntityException } from '@nestjs/common'

import { TenantAgent } from 'common/agent'
import { AuthInfo, Role } from 'common/auth'
import { Schema, Wallet } from 'common/entities'
import { Logger } from 'common/logger'
import { WalletLockService } from 'common/wallet-lock'
import { DidService } from 'did/did.service'
import { OpenId4VcIssuerService } from 'openid4vc/issuer/issuer.service'
import { OpenId4VcVerifierService } from 'openid4vc/verifier/verifier.service'
import { SchemaV2Service } from 'schema-v2/schema-v2.service'
import { UserService } from 'user/user.service'

import { PreparedDidStatus } from '../dto/prepare-wallet.dto'
import { PrepareWalletService } from '../prepare-wallet.service'

describe('PrepareWalletService', () => {
  let prepareWalletService: PrepareWalletService
  let logger: Logger
  let didService: DidService
  let issuerService: OpenId4VcIssuerService
  let verifierService: OpenId4VcVerifierService
  let schemaV2Service: SchemaV2Service
  let userService: UserService
  let walletLockService: WalletLockService
  let tenantAgent: TenantAgent
  let em: EntityManager
  let wallet: Wallet

  const authInfo: AuthInfo = {
    userId: 'user-1',
    user: { id: 'user-1' } as any,
    userName: 'testuser',
    role: Role.Admin,
    walletId: 'Administration',
    tenantId: 'tenant-1',
  }

  const makeService = () =>
    new PrepareWalletService(
      logger,
      em,
      didService,
      issuerService,
      verifierService,
      schemaV2Service,
      userService,
      walletLockService,
      { lockTimeout: 300 },
    )

  const prepare = (req = {}) => prepareWalletService.prepareWallet(authInfo, tenantAgent, req)

  beforeEach(() => {
    logger = createMock<Logger>()
    didService = createMock<DidService>({ findOwnDid: vi.fn().mockResolvedValue(undefined) })
    issuerService = createMock<OpenId4VcIssuerService>({ find: vi.fn().mockResolvedValue([]) })
    verifierService = createMock<OpenId4VcVerifierService>({ find: vi.fn().mockResolvedValue([]) })
    schemaV2Service = createMock<SchemaV2Service>()
    userService = createMock<UserService>()
    walletLockService = createMock<WalletLockService>({
      runExclusive: vi.fn((_walletId: string, _timeout: number, operation: () => Promise<unknown>) => operation()),
    })
    wallet = { id: 'Administration', publicDid: undefined } as Wallet
    em = createMock<EntityManager>()
    vi.mocked(em.findOneOrFail).mockResolvedValue(wallet)
    vi.mocked(em.findOne).mockResolvedValue(null)
    prepareWalletService = makeService()
    tenantAgent = createMock<TenantAgent>()
  })

  describe('one call at a time per wallet (8.1, 8.2, 8.3)', () => {
    test('runs the whole preparation under the lock of the wallet, with the configured timeout', async () => {
      vi.mocked(didService.getMethods).mockReturnValue({ methods: ['key'] })
      vi.mocked(didService.create).mockImplementation(() => {
        expect(walletLockService.runExclusive).toHaveBeenCalledTimes(1)
        return Promise.resolve({ id: 'did:key:z1' } as any)
      })

      await prepare()

      expect(walletLockService.runExclusive).toHaveBeenCalledWith('Administration', 300, expect.any(Function))
    })

    test('re-reads the wallet after taking the lock, so it sees what the previous holder prepared', async () => {
      wallet.publicDid = 'did:key:existing'
      vi.mocked(didService.getMethods).mockReturnValue({ methods: ['key'] })

      await prepare()

      expect(em.findOneOrFail).toHaveBeenCalledWith(Wallet, { id: 'Administration' }, { refresh: true })
    })

    test('a caller after a completed preparation creates nothing and gets every DID as existing', async () => {
      wallet.publicDid = 'did:key:z1'
      vi.mocked(didService.getMethods).mockReturnValue({ methods: ['key', 'hedera'] })
      vi.mocked(didService.findOwnDid).mockResolvedValue('did:hedera:zH')
      vi.mocked(issuerService.find).mockResolvedValue([{}] as any)
      vi.mocked(verifierService.find).mockResolvedValue([{}] as any)

      const result = await prepare()

      expect(result).toEqual({
        did: 'did:key:z1',
        dids: [
          { method: 'key', did: 'did:key:z1', status: PreparedDidStatus.Existing },
          { method: 'hedera', did: 'did:hedera:zH', status: PreparedDidStatus.Existing },
        ],
      })
      expect(didService.create).not.toHaveBeenCalled()
      expect(issuerService.createIssuer).not.toHaveBeenCalled()
      expect(verifierService.createVerifier).not.toHaveBeenCalled()
      expect(userService.patchMe).not.toHaveBeenCalled()
    })

    test('uses a main DID that another instance created through POST /dids in the meantime', async () => {
      vi.mocked(didService.getMethods).mockReturnValue({ methods: ['key', 'indy'] })
      vi.mocked(didService.create).mockImplementation((_authInfo, { method }) => {
        if (method === 'key') {
          wallet.publicDid = 'did:key:concurrent'
          return Promise.reject(new ConflictException('The wallet already contains created public DID'))
        }
        return Promise.resolve({ id: 'did:indy:z2' } as any)
      })

      const result = await prepare()

      expect(result.did).toBe('did:key:concurrent')
      expect(result.dids[0]).toEqual({ method: 'key', did: 'did:key:concurrent', status: PreparedDidStatus.Existing })
      // The rest of the wallet is still prepared by this call
      expect(result.dids[1]).toEqual({ method: 'indy', did: 'did:indy:z2', status: PreparedDidStatus.Created })
    })

    test('returns 409 as is when the wallet still has no main DID', async () => {
      vi.mocked(didService.getMethods).mockReturnValue({ methods: ['key'] })
      const error = new ConflictException('conflict')
      vi.mocked(didService.create).mockRejectedValue(error)

      await expect(prepare()).rejects.toBe(error)
    })
  })

  describe('missing parts are reported and created by a repeated call (8.4)', () => {
    test('reports a failed method, and a repeated call creates it', async () => {
      vi.mocked(didService.getMethods).mockReturnValue({ methods: ['key', 'hedera'] })
      vi.mocked(didService.create)
        .mockResolvedValueOnce({ id: 'did:key:z1' } as any)
        .mockRejectedValueOnce(new UnprocessableEntityException('A hedera DID created by Administration is required'))

      const first = await prepare()

      expect(first.dids[1]).toEqual({
        method: 'hedera',
        status: PreparedDidStatus.Failed,
        error: 'A hedera DID created by Administration is required',
      })

      wallet.publicDid = 'did:key:z1'
      vi.mocked(didService.create).mockResolvedValueOnce({ id: 'did:hedera:zH' } as any)

      const second = await prepare()

      expect(didService.create).toHaveBeenLastCalledWith(authInfo, { method: 'hedera' })
      expect(second.dids).toEqual([
        { method: 'key', did: 'did:key:z1', status: PreparedDidStatus.Existing },
        { method: 'hedera', did: 'did:hedera:zH', status: PreparedDidStatus.Created },
      ])
    })

    test('a method the role may not use is reported as skipped', async () => {
      vi.mocked(didService.getMethods).mockReturnValue({ methods: ['key', 'hedera'] })
      vi.mocked(didService.create)
        .mockResolvedValueOnce({ id: 'did:key:z1' } as any)
        .mockRejectedValueOnce(new ForbiddenException("Role 'Verifier' can only create did:key DIDs, not 'hedera'"))

      const result = await prepare()

      expect(result.dids[1]).toMatchObject({ method: 'hedera', status: PreparedDidStatus.Skipped })
    })

    test('creates missing OID4VC records of an existing DID', async () => {
      wallet.publicDid = 'did:key:z1'
      vi.mocked(didService.getMethods).mockReturnValue({ methods: ['key'] })
      vi.mocked(issuerService.find).mockResolvedValue([{}] as any)

      const result = await prepare()

      expect(issuerService.createIssuer).not.toHaveBeenCalled()
      expect(verifierService.createVerifier).toHaveBeenCalledWith(tenantAgent, { publicVerifierId: 'did:key:z1' })
      expect(result.dids[0].status).toBe(PreparedDidStatus.Existing)
    })

    test('reports a DID whose OID4VC records could not be created as failed', async () => {
      vi.mocked(didService.getMethods).mockReturnValue({ methods: ['key'] })
      vi.mocked(didService.create).mockResolvedValue({ id: 'did:key:z1' } as any)
      vi.mocked(issuerService.createIssuer).mockRejectedValue(new Error('storage failure'))

      const result = await prepare()

      expect(result.did).toBe('did:key:z1')
      expect(result.dids[0]).toEqual({
        method: 'key',
        did: 'did:key:z1',
        status: PreparedDidStatus.Failed,
        error: 'OID4VC records: storage failure',
      })
    })

    test('a failed DID lookup fails only that method', async () => {
      wallet.publicDid = 'did:key:z1'
      vi.mocked(didService.getMethods).mockReturnValue({ methods: ['key', 'hedera'] })
      vi.mocked(didService.findOwnDid).mockRejectedValue(new Error('wallet lookup failure'))

      const result = await prepare()

      expect(result.dids).toEqual([
        { method: 'key', did: 'did:key:z1', status: PreparedDidStatus.Existing },
        { method: 'hedera', status: PreparedDidStatus.Failed, error: 'DID lookup: wallet lookup failure' },
      ])
    })
  })

  describe('first preparation', () => {
    test('creates DIDs for all methods, initializes OID4VC, and patches user', async () => {
      vi.mocked(didService.getMethods).mockReturnValue({ methods: ['key', 'indy'] })
      vi.mocked(didService.create)
        .mockResolvedValueOnce({ id: 'did:key:z1' } as any)
        .mockResolvedValueOnce({ id: 'did:indy:z2' } as any)

      const result = await prepare()

      expect(didService.create).toHaveBeenNthCalledWith(1, authInfo, { method: 'key' })
      expect(didService.create).toHaveBeenNthCalledWith(2, authInfo, { method: 'indy' })
      expect(result.did).toBe('did:key:z1')
      expect(result.dids.map(({ status }) => status)).toEqual([PreparedDidStatus.Created, PreparedDidStatus.Created])
      expect(issuerService.createIssuer).toHaveBeenCalledTimes(2)
      expect(verifierService.createVerifier).toHaveBeenCalledTimes(2)
      expect(userService.patchMe).toHaveBeenCalledWith(
        authInfo,
        tenantAgent,
        expect.objectContaining({ name: 'testuser', backgroundColor: '#f58529' }),
        undefined,
      )
    })

    test('returns the main DID error as is when the main method fails', async () => {
      vi.mocked(didService.getMethods).mockReturnValue({ methods: ['key'] })
      const error = new Error('KMS failure')
      vi.mocked(didService.create).mockRejectedValue(error)

      await expect(prepare()).rejects.toBe(error)
      expect(didService.create).toHaveBeenCalledWith(authInfo, { method: 'key' })
    })

    test('creates the main-method DID first regardless of the configured order', async () => {
      vi.mocked(didService.getMethods).mockReturnValue({ methods: ['indy', 'key', 'hedera'] })
      vi.mocked(didService.create)
        .mockResolvedValueOnce({ id: 'did:key:z1' } as any)
        .mockResolvedValueOnce({ id: 'did:indy:z2' } as any)
        .mockResolvedValueOnce({ id: 'did:hedera:z3' } as any)

      const result = await prepare()

      expect(didService.create).toHaveBeenNthCalledWith(1, authInfo, { method: 'key' })
      expect(didService.create).toHaveBeenNthCalledWith(2, authInfo, { method: 'indy' })
      expect(didService.create).toHaveBeenNthCalledWith(3, authInfo, { method: 'hedera' })
      expect(result.did).toBe('did:key:z1')
    })

    test('a main-method failure leaves no non-main DID or OID4VC record behind', async () => {
      vi.mocked(didService.getMethods).mockReturnValue({ methods: ['indy', 'key'] })
      const error = new Error('KMS failure')
      vi.mocked(didService.create).mockRejectedValue(error)

      await expect(prepare()).rejects.toBe(error)

      expect(didService.create).toHaveBeenCalledTimes(1)
      expect(didService.create).toHaveBeenCalledWith(authInfo, { method: 'key' })
      expect(issuerService.createIssuer).not.toHaveBeenCalled()
      expect(verifierService.createVerifier).not.toHaveBeenCalled()
      expect(userService.patchMe).not.toHaveBeenCalled()
    })

    test('continues when a non-main DID method fails', async () => {
      vi.mocked(didService.getMethods).mockReturnValue({ methods: ['key', 'indy'] })
      vi.mocked(didService.create)
        .mockResolvedValueOnce({ id: 'did:key:z1' } as any)
        .mockRejectedValueOnce(new Error('Indy failure'))

      const result = await prepare()

      expect(result.did).toBe('did:key:z1')
      expect(result.dids[1]).toEqual({ method: 'indy', status: PreparedDidStatus.Failed, error: 'Indy failure' })
      // Only 1 issuer/verifier created (for the key method; indy failed)
      expect(issuerService.createIssuer).toHaveBeenCalledTimes(1)
    })
  })

  describe('schemas', () => {
    const schemaRequest = (registrations: object[]) => ({
      schemas: [{ name: 'TestSchema', fields: [{ name: 'field1' }], registrations } as any],
    })

    beforeEach(() => {
      vi.mocked(schemaV2Service.create).mockResolvedValue({ id: 'schema-1' } as any)
      vi.mocked(schemaV2Service.registration).mockResolvedValue({})
    })

    test('creates and registers schemas when provided', async () => {
      vi.mocked(didService.getMethods).mockReturnValue({ methods: ['key'] })
      vi.mocked(didService.create).mockResolvedValue({ id: 'did:key:z1' } as any)

      const result = await prepare(schemaRequest([{ protocol: 'Oid4vc', credentialFormat: 'SdJwtVc' }]))

      expect(schemaV2Service.create).toHaveBeenCalledWith(
        authInfo,
        expect.objectContaining({ name: 'TestSchema' }),
        undefined,
      )
      expect(schemaV2Service.registration).toHaveBeenCalledWith(
        authInfo,
        tenantAgent,
        'schema-1',
        expect.objectContaining({ did: 'did:key:z1' }),
      )
      expect(result.did).toBe('did:key:z1')
      expect(schemaV2Service.create).toHaveBeenCalledTimes(1)
      expect(schemaV2Service.registration).toHaveBeenCalledTimes(1)
    })

    test('registers schema against the DID matching the registration network', async () => {
      vi.mocked(didService.getMethods).mockReturnValue({ methods: ['key', 'hedera'] })
      vi.mocked(didService.create)
        .mockResolvedValueOnce({ id: 'did:key:z1' } as any)
        .mockResolvedValueOnce({ id: 'did:hedera:zH' } as any)

      await prepare(schemaRequest([{ protocol: 'Oid4vc', credentialFormat: 'SdJwtVc', network: 'hedera' }]))

      expect(schemaV2Service.registration).toHaveBeenCalledWith(
        authInfo,
        tenantAgent,
        'schema-1',
        expect.objectContaining({ network: 'hedera', did: 'did:hedera:zH' }),
      )
    })

    test('skips registration when no DID exists for the requested network', async () => {
      vi.mocked(didService.getMethods).mockReturnValue({ methods: ['key'] })
      vi.mocked(didService.create).mockResolvedValue({ id: 'did:key:z1' } as any)

      await prepare(schemaRequest([{ protocol: 'Oid4vc', credentialFormat: 'SdJwtVc', network: 'hedera' }]))

      expect(schemaV2Service.registration).not.toHaveBeenCalled()
    })

    test('an existing schema is not created again, but gets the registrations the previous call missed', async () => {
      wallet.publicDid = 'did:key:z1'
      vi.mocked(didService.getMethods).mockReturnValue({ methods: ['key', 'hedera'] })
      vi.mocked(didService.findOwnDid).mockResolvedValue('did:hedera:zH')
      vi.mocked(em.findOne).mockResolvedValue({ id: 'schema-existing' } as Schema)
      vi.mocked(schemaV2Service.registration)
        .mockRejectedValueOnce(new Error('Schema is already registered here'))
        .mockResolvedValueOnce({})

      await prepare(
        schemaRequest([
          { protocol: 'Oid4vc', credentialFormat: 'SdJwtVc', network: 'key' },
          { protocol: 'Oid4vc', credentialFormat: 'SdJwtVc', network: 'hedera' },
        ]),
      )

      expect(schemaV2Service.create).not.toHaveBeenCalled()
      expect(schemaV2Service.registration).toHaveBeenCalledTimes(2)
      expect(schemaV2Service.registration).toHaveBeenLastCalledWith(
        authInfo,
        tenantAgent,
        'schema-existing',
        expect.objectContaining({ network: 'hedera', did: 'did:hedera:zH' }),
      )
    })
  })
})
