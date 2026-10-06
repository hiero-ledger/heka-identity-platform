import { IncomingMessage } from 'http'

import { createMock } from '@golevelup/ts-vitest'
import { EntityManager } from '@mikro-orm/core'
import { UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'

import { Agent } from 'common/agent'
import { Role } from 'common/auth'
import { User, Wallet } from 'common/entities'
import { Logger } from 'common/logger'
import { getWalletId } from 'utils/auth'

import { AuthService } from '../auth.service'
import { TokenRevocationService } from '../token-revocation.service'

describe('getWalletId', () => {
  test.each([
    [{ role: Role.Admin, userId: '11' }, 'Administration_11'],
    [{ role: Role.OrgAdmin, userId: '12', orgId: '1' }, 'Organization_1'],
    [{ role: Role.OrgManager, userId: '13', orgId: '1' }, 'Organization_1'],
    [{ role: Role.OrgMember, userId: '14', orgId: '1' }, 'Organization_1'],
    [{ role: Role.Issuer, userId: '15', orgId: '1' }, 'Issuer_15_in_Organization_1'],
    [{ role: Role.Verifier, userId: '16', orgId: '2' }, 'Verifier_16_in_Organization_2'],
    [{ role: Role.User, userId: '17' }, 'User_17'],
  ])("for %o returns '%s'", (params: { role: Role; userId: string; orgId?: string }, expected: string) => {
    const actual = getWalletId(params)
    expect(actual).toBe(expected)
  })

  test.each([
    { role: Role.Admin, userId: '11', orgId: '1' },
    { role: Role.OrgAdmin, userId: '12' },
    { role: Role.OrgManager, userId: '13' },
    { role: Role.OrgMember, userId: '14' },
    { role: Role.Issuer, userId: '15' },
    { role: Role.Verifier, userId: '16' },
    { role: Role.User, userId: '17', orgId: '2' },
  ])('for %o throws UnauthorizedException', (params: { role: Role; userId: string; orgId?: string }) => {
    expect(() => getWalletId(params)).toThrow(UnauthorizedException)
  })
})

describe('AuthService', () => {
  let service: AuthService
  let agent: Agent
  let jwtService: JwtService
  let em: EntityManager
  let logger: Logger
  let tokenRevocation: { assertTokenActive: ReturnType<typeof vi.fn> }

  const makeUser = (overrides: Partial<User> & { walletsContains?: boolean } = {}): User => {
    const walletsContains = overrides.walletsContains ?? true
    return {
      id: overrides.id ?? 'user-1',
      wallets: {
        init: vi.fn().mockResolvedValue(undefined),
        contains: vi.fn().mockReturnValue(walletsContains),
        add: vi.fn(),
      },
    } as unknown as User
  }

  const makeWallet = (overrides: Partial<Wallet> = {}): Wallet =>
    ({
      id: 'Issuer_11_in_Organization_7',
      tenantId: 'tenant-xyz',
      ...overrides,
    }) as Wallet

  beforeEach(() => {
    agent = createMock<Agent>({
      modules: {
        tenants: {
          createTenant: vi.fn(),
          withTenantAgent: vi.fn().mockImplementation(async (_opts: unknown, cb: (ta: unknown) => Promise<void>) => {
            await cb({ modules: { anoncreds: { createLinkSecret: vi.fn() } } })
          }),
        },
      },
    })
    jwtService = createMock<JwtService>()
    em = createMock<EntityManager>()
    logger = createMock<Logger>()
    // Revocation check passes by default (disabled or token active)
    tokenRevocation = { assertTokenActive: vi.fn().mockResolvedValue(undefined) }
    service = new AuthService(agent, jwtService, em, logger, tokenRevocation as unknown as TokenRevocationService)
  })

  describe('validateRequestToken', () => {
    test('throws when Authorization header is missing', async () => {
      const request = { headers: {} } as IncomingMessage

      await expect(service.validateRequestToken(request)).rejects.toThrow('Authorization token is missing')
    })

    test('throws when scheme is not Bearer', async () => {
      const request = { headers: { authorization: 'Basic abc123' } } as IncomingMessage

      await expect(service.validateRequestToken(request)).rejects.toThrow('Authorization token is missing')
    })

    test('verifies token and returns AuthInfo', async () => {
      const request = { headers: { authorization: 'Bearer my-jwt' } } as IncomingMessage
      const payload = { sub: '11', org_id: '7', name: 'test', roles: [Role.Issuer] }

      vi.mocked(jwtService.verifyAsync).mockResolvedValue(payload)

      const user = makeUser({ id: '11' })
      const wallet = makeWallet()
      vi.mocked(em.findOne).mockResolvedValueOnce(user).mockResolvedValueOnce(wallet)

      const result = await service.validateRequestToken(request)

      expect(jwtService.verifyAsync).toHaveBeenCalledWith('my-jwt')
      expect(em.findOne).toHaveBeenNthCalledWith(1, User, { id: '11' })
      expect(em.findOne).toHaveBeenNthCalledWith(2, Wallet, { id: 'Issuer_11_in_Organization_7' })
      expect(result.userId).toBe('11')
      expect(result.role).toBe(Role.Issuer)
      expect(result.walletId).toBe('Issuer_11_in_Organization_7')
      expect(result.tenantId).toBe('tenant-xyz')
    })

    test('checks revocation with the raw token after signature verification', async () => {
      const request = { headers: { authorization: 'Bearer my-jwt' } } as IncomingMessage
      const payload = { sub: '11', org_id: '7', name: 'test', roles: [Role.Issuer] }

      vi.mocked(jwtService.verifyAsync).mockResolvedValue(payload)
      vi.mocked(em.findOne)
        .mockResolvedValueOnce(makeUser({ id: '11' }))
        .mockResolvedValueOnce(makeWallet())

      await service.validateRequestToken(request)

      expect(tokenRevocation.assertTokenActive).toHaveBeenCalledWith('my-jwt')
      expect(vi.mocked(jwtService.verifyAsync).mock.invocationCallOrder[0]).toBeLessThan(
        tokenRevocation.assertTokenActive.mock.invocationCallOrder[0],
      )
    })

    test('rejects a revoked token without provisioning user or wallet', async () => {
      const request = { headers: { authorization: 'Bearer revoked-jwt' } } as IncomingMessage
      const payload = { sub: '11', org_id: '7', name: 'test', roles: [Role.Issuer] }

      vi.mocked(jwtService.verifyAsync).mockResolvedValue(payload)
      tokenRevocation.assertTokenActive.mockRejectedValue(new UnauthorizedException())

      await expect(service.validateRequestToken(request)).rejects.toThrow(UnauthorizedException)

      expect(tokenRevocation.assertTokenActive).toHaveBeenCalledWith('revoked-jwt')
      expect(em.findOne).not.toHaveBeenCalled()
      expect(em.persist).not.toHaveBeenCalled()
      expect(agent.modules.tenants.createTenant).not.toHaveBeenCalled()
    })

    test('does not check revocation when signature verification fails', async () => {
      const request = { headers: { authorization: 'Bearer forged-jwt' } } as IncomingMessage

      vi.mocked(jwtService.verifyAsync).mockRejectedValue(new Error('invalid signature'))

      await expect(service.validateRequestToken(request)).rejects.toThrow('invalid signature')

      expect(tokenRevocation.assertTokenActive).not.toHaveBeenCalled()
    })
  })

  describe('validateTokenPayload', () => {
    test('throws UnauthorizedException when payload has multiple roles', async () => {
      const payload = { sub: '11', org_id: '7', name: 'test', roles: [Role.Admin, Role.Issuer] } as any

      await expect(service.validateTokenPayload(payload)).rejects.toThrow(UnauthorizedException)
    })

    test('throws UnauthorizedException when role is not a valid Role', async () => {
      const payload = { sub: '11', org_id: '7', name: 'test', roles: ['Hacker'] } as any

      await expect(service.validateTokenPayload(payload)).rejects.toThrow(UnauthorizedException)
    })

    test('returns AuthInfo when user and wallet exist and wallet already linked', async () => {
      const payload = { sub: '11', org_id: '7', name: 'Alice', roles: [Role.Issuer] } as any
      const user = makeUser({ id: '11', walletsContains: true })
      const wallet = makeWallet()

      vi.mocked(em.findOne).mockResolvedValueOnce(user).mockResolvedValueOnce(wallet)

      const result = await service.validateTokenPayload(payload)

      expect(em.findOne).toHaveBeenNthCalledWith(1, User, { id: '11' })
      expect(em.findOne).toHaveBeenNthCalledWith(2, Wallet, { id: 'Issuer_11_in_Organization_7' })
      expect(result).toEqual({
        userId: '11',
        user,
        userName: 'Alice',
        role: Role.Issuer,
        orgId: '7',
        walletId: 'Issuer_11_in_Organization_7',
        tenantId: 'tenant-xyz',
      })
      expect(user.wallets.add).not.toHaveBeenCalled()
      expect(em.flush).not.toHaveBeenCalled()
    })

    test('links wallet to user when not already linked', async () => {
      const payload = { sub: '11', org_id: '7', name: 'Alice', roles: [Role.Issuer] } as any
      const user = makeUser({ id: '11', walletsContains: false })
      const wallet = makeWallet()

      vi.mocked(em.findOne).mockResolvedValueOnce(user).mockResolvedValueOnce(wallet)

      await service.validateTokenPayload(payload)

      expect(em.findOne).toHaveBeenNthCalledWith(1, User, { id: '11' })
      expect(em.findOne).toHaveBeenNthCalledWith(2, Wallet, { id: 'Issuer_11_in_Organization_7' })
      expect(user.wallets.add).toHaveBeenCalledWith(wallet)
      expect(em.flush).toHaveBeenCalled()
    })

    test('creates user when not found', async () => {
      const payload = { sub: 'new-user', org_id: '7', name: 'Bob', roles: [Role.Issuer] } as any
      const wallet = makeWallet()

      vi.mocked(em.findOne).mockResolvedValueOnce(null).mockResolvedValueOnce(wallet)

      // The new User created inside the service has real Collection internals; replace findOne
      // behavior so the second path (wallets.init / contains / add) works via a post-create hook.
      vi.mocked(em.persist).mockImplementation((entity: any) => {
        if (entity instanceof User) {
          entity.wallets = {
            init: vi.fn().mockResolvedValue(undefined),
            contains: vi.fn().mockReturnValue(true),
            add: vi.fn(),
          } as any
        }
        return em
      })

      const result = await service.validateTokenPayload(payload)

      expect(em.findOne).toHaveBeenNthCalledWith(1, User, { id: 'new-user' })
      expect(em.findOne).toHaveBeenNthCalledWith(2, Wallet, { id: 'Issuer_new-user_in_Organization_7' })
      expect(em.flush).toHaveBeenCalled()
      expect(result.userId).toBe('new-user')
    })

    test('creates wallet + tenant + link secret when wallet not found', async () => {
      const payload = { sub: '11', org_id: '7', name: 'Alice', roles: [Role.Issuer] } as any
      const user = makeUser({ id: '11', walletsContains: true })

      vi.mocked(em.findOne).mockResolvedValueOnce(user).mockResolvedValueOnce(null)

      vi.mocked(agent.modules.tenants.createTenant).mockResolvedValue({ id: 'new-tenant-id' } as any)

      const createLinkSecret = vi.fn()
      vi.mocked(agent.modules.tenants.withTenantAgent).mockImplementation(async (_opts, cb) => {
        await cb({ modules: { anoncreds: { createLinkSecret } } } as any)
      })

      const result = await service.validateTokenPayload(payload)

      expect(em.findOne).toHaveBeenNthCalledWith(1, User, { id: '11' })
      expect(em.findOne).toHaveBeenNthCalledWith(2, Wallet, { id: 'Issuer_11_in_Organization_7' })
      expect(agent.modules.tenants.createTenant).toHaveBeenCalledWith({
        config: { label: 'Issuer_11_in_Organization_7' },
      })
      expect(createLinkSecret).toHaveBeenCalled()
      expect(result.tenantId).toBe('new-tenant-id')
    })
  })
})
