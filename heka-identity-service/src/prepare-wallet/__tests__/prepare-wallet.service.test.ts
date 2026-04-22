import { createMock } from '@golevelup/ts-vitest'

import { TenantAgent } from 'common/agent'
import { Role } from 'common/auth'
import { Logger } from 'common/logger'
import { DidService } from 'did/did.service'
import { OpenId4VcIssuerService } from 'openid4vc/issuer/issuer.service'
import { OpenId4VcVerifierService } from 'openid4vc/verifier/verifier.service'
import { SchemaV2Service } from 'schema-v2/schema-v2.service'
import { UserService } from 'user/user.service'

import { PrepareWalletService } from '../prepare-wallet.service'

describe('PrepareWalletService', () => {
  let prepareWalletService: PrepareWalletService
  let logger: Logger
  let didService: DidService
  let issuerService: OpenId4VcIssuerService
  let verifierService: OpenId4VcVerifierService
  let schemaV2Service: SchemaV2Service
  let userService: UserService
  let tenantAgent: TenantAgent

  const authInfo = {
    userId: 'user-1',
    user: { id: 'user-1' } as any,
    userName: 'testuser',
    role: Role.Admin,
    orgId: '1',
    walletId: 'Administration_user-1',
    tenantId: 'tenant-1',
  }

  beforeEach(() => {
    logger = createMock<Logger>()
    didService = createMock<DidService>()
    issuerService = createMock<OpenId4VcIssuerService>()
    verifierService = createMock<OpenId4VcVerifierService>()
    schemaV2Service = createMock<SchemaV2Service>()
    userService = createMock<UserService>()
    prepareWalletService = new PrepareWalletService(
      logger,
      didService,
      issuerService,
      verifierService,
      schemaV2Service,
      userService,
    )
    tenantAgent = createMock<TenantAgent>()
  })

  test('returns existing DID when wallet is already prepared', async () => {
    vi.mocked(didService.find).mockResolvedValue([{ id: 'did:key:existing' }] as any)

    const result = await prepareWalletService.prepareWallet(authInfo, tenantAgent, {})

    expect(didService.find).toHaveBeenCalledWith(tenantAgent, expect.objectContaining({ method: 'key', own: true }))
    expect(result.did).toBe('did:key:existing')
    expect(didService.create).not.toHaveBeenCalled()
  })

  test('creates DIDs for all methods, initializes OID4VC, and patches user', async () => {
    vi.mocked(didService.find).mockResolvedValue([])
    vi.mocked(didService.getMethods).mockReturnValue({ methods: ['key', 'indy'] } as any)

    vi.mocked(didService.create)
      .mockResolvedValueOnce({ id: 'did:key:z1' } as any)
      .mockResolvedValueOnce({ id: 'did:indy:z2' } as any)

    vi.mocked(issuerService.createIssuer).mockResolvedValue({} as any)
    vi.mocked(verifierService.createVerifier).mockResolvedValue({} as any)

    const result = await prepareWalletService.prepareWallet(authInfo, tenantAgent, {})

    expect(didService.create).toHaveBeenNthCalledWith(1, authInfo, { method: 'key' })
    expect(didService.create).toHaveBeenNthCalledWith(2, authInfo, { method: 'indy' })
    expect(result.did).toBe('did:key:z1')
    expect(issuerService.createIssuer).toHaveBeenCalledTimes(2)
    expect(verifierService.createVerifier).toHaveBeenCalledTimes(2)
    expect(userService.patchMe).toHaveBeenCalledWith(
      authInfo,
      tenantAgent,
      expect.objectContaining({ name: 'testuser', backgroundColor: '#f58529' }),
      undefined,
    )
  })

  test('throws when main DID method (key) fails to create', async () => {
    vi.mocked(didService.find).mockResolvedValue([])
    vi.mocked(didService.getMethods).mockReturnValue({ methods: ['key'] } as any)
    vi.mocked(didService.create).mockRejectedValue(new Error('KMS failure'))

    await expect(prepareWalletService.prepareWallet(authInfo, tenantAgent, {})).rejects.toThrow(
      'Failed to create DID for main method key',
    )
    expect(didService.create).toHaveBeenCalledWith(authInfo, { method: 'key' })
  })

  test('continues when a non-main DID method fails', async () => {
    vi.mocked(didService.find).mockResolvedValue([])
    vi.mocked(didService.getMethods).mockReturnValue({ methods: ['key', 'indy'] } as any)
    vi.mocked(didService.create)
      .mockResolvedValueOnce({ id: 'did:key:z1' } as any)
      .mockRejectedValueOnce(new Error('Indy failure'))

    vi.mocked(issuerService.createIssuer).mockResolvedValue({} as any)
    vi.mocked(verifierService.createVerifier).mockResolvedValue({} as any)

    const result = await prepareWalletService.prepareWallet(authInfo, tenantAgent, {})

    expect(didService.create).toHaveBeenNthCalledWith(1, authInfo, { method: 'key' })
    expect(didService.create).toHaveBeenNthCalledWith(2, authInfo, { method: 'indy' })
    expect(result.did).toBe('did:key:z1')
    // Only 1 issuer/verifier created (for the key method; indy failed)
    expect(issuerService.createIssuer).toHaveBeenCalledTimes(1)
  })

  test('creates and registers schemas when provided', async () => {
    vi.mocked(didService.find).mockResolvedValue([])
    vi.mocked(didService.getMethods).mockReturnValue({ methods: ['key'] } as any)
    vi.mocked(didService.create).mockResolvedValue({ id: 'did:key:z1' } as any)
    vi.mocked(issuerService.createIssuer).mockResolvedValue({} as any)
    vi.mocked(verifierService.createVerifier).mockResolvedValue({} as any)

    vi.mocked(schemaV2Service.create).mockResolvedValue({ id: 'schema-1' } as any)
    vi.mocked(schemaV2Service.registration).mockResolvedValue({} as any)

    const result = await prepareWalletService.prepareWallet(authInfo, tenantAgent, {
      schemas: [
        {
          name: 'TestSchema',
          fields: [{ name: 'field1' }],
          registrations: [{ protocol: 'Oid4vc', credentialFormat: 'SdJwtVc' }],
        } as any,
      ],
    })

    expect(didService.create).toHaveBeenCalledWith(authInfo, { method: 'key' })
    expect(schemaV2Service.create).toHaveBeenCalledWith(
      authInfo,
      expect.objectContaining({ name: 'TestSchema' }),
      undefined,
    )
    expect(schemaV2Service.registration).toHaveBeenCalledWith(authInfo, tenantAgent, 'schema-1', expect.anything())
    expect(result.did).toBe('did:key:z1')
    expect(schemaV2Service.create).toHaveBeenCalledTimes(1)
    expect(schemaV2Service.registration).toHaveBeenCalledTimes(1)
  })
})
