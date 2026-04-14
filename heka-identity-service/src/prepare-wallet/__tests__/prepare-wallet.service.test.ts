import { createMock } from '@golevelup/ts-vitest'
import { when } from 'vitest-when'

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
    when(didService.find)
      .calledWith(tenantAgent, expect.objectContaining({ method: 'key', own: true }))
      .thenResolve([{ id: 'did:key:existing' }] as any)

    const result = await prepareWalletService.prepareWallet(authInfo, tenantAgent, {})

    expect(result.did).toBe('did:key:existing')
    expect(didService.create).not.toHaveBeenCalled()
  })

  test('creates DIDs for all methods, initializes OID4VC, and patches user', async () => {
    when(didService.find).calledWith(tenantAgent, expect.anything()).thenResolve([])
    when(didService.getMethods).calledWith().thenReturn({ methods: ['key', 'indy'] } as any)

    when(didService.create)
      .calledWith(authInfo, { method: 'key' })
      .thenResolve({ id: 'did:key:z1' } as any)
    when(didService.create)
      .calledWith(authInfo, { method: 'indy' })
      .thenResolve({ id: 'did:indy:z2' } as any)

    when(issuerService.createIssuer).calledWith(tenantAgent, expect.anything()).thenResolve({} as any)
    when(verifierService.createVerifier).calledWith(tenantAgent, expect.anything()).thenResolve({} as any)

    const result = await prepareWalletService.prepareWallet(authInfo, tenantAgent, {})

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
    when(didService.find).calledWith(tenantAgent, expect.anything()).thenResolve([])
    when(didService.getMethods).calledWith().thenReturn({ methods: ['key'] } as any)
    when(didService.create).calledWith(authInfo, { method: 'key' }).thenReject(new Error('KMS failure'))

    await expect(prepareWalletService.prepareWallet(authInfo, tenantAgent, {})).rejects.toThrow(
      'Failed to create DID for main method key',
    )
  })

  test('continues when a non-main DID method fails', async () => {
    when(didService.find).calledWith(tenantAgent, expect.anything()).thenResolve([])
    when(didService.getMethods).calledWith().thenReturn({ methods: ['key', 'indy'] } as any)
    when(didService.create)
      .calledWith(authInfo, { method: 'key' })
      .thenResolve({ id: 'did:key:z1' } as any)
    when(didService.create).calledWith(authInfo, { method: 'indy' }).thenReject(new Error('Indy failure'))

    when(issuerService.createIssuer).calledWith(tenantAgent, expect.anything()).thenResolve({} as any)
    when(verifierService.createVerifier).calledWith(tenantAgent, expect.anything()).thenResolve({} as any)

    const result = await prepareWalletService.prepareWallet(authInfo, tenantAgent, {})

    expect(result.did).toBe('did:key:z1')
    // Only 1 issuer/verifier created (for the key method; indy failed)
    expect(issuerService.createIssuer).toHaveBeenCalledTimes(1)
  })

  test('creates and registers schemas when provided', async () => {
    when(didService.find).calledWith(tenantAgent, expect.anything()).thenResolve([])
    when(didService.getMethods).calledWith().thenReturn({ methods: ['key'] } as any)
    when(didService.create)
      .calledWith(authInfo, { method: 'key' })
      .thenResolve({ id: 'did:key:z1' } as any)
    when(issuerService.createIssuer).calledWith(tenantAgent, expect.anything()).thenResolve({} as any)
    when(verifierService.createVerifier).calledWith(tenantAgent, expect.anything()).thenResolve({} as any)

    when(schemaV2Service.create)
      .calledWith(authInfo, expect.objectContaining({ name: 'TestSchema' }), undefined)
      .thenResolve({ id: 'schema-1' } as any)
    when(schemaV2Service.registration)
      .calledWith(authInfo, tenantAgent, 'schema-1', expect.anything())
      .thenResolve({} as any)

    const result = await prepareWalletService.prepareWallet(authInfo, tenantAgent, {
      schemas: [
        {
          name: 'TestSchema',
          fields: [{ name: 'field1' }],
          registrations: [{ protocol: 'Oid4vc', credentialFormat: 'SdJwtVc' }],
        } as any,
      ],
    })

    expect(result.did).toBe('did:key:z1')
    expect(schemaV2Service.create).toHaveBeenCalledTimes(1)
    expect(schemaV2Service.registration).toHaveBeenCalledTimes(1)
  })
})
