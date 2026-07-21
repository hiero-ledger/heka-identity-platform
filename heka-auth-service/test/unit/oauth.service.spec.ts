import { UnauthorizedException } from '@nestjs/common'
import type { JwtService } from '@nestjs/jwt'

import type { ConfigService } from '../../src/core/config'
import { jwtConfigDefaults } from '../../src/core/config/configs/jwt.config'
import { TokenType } from '../../src/core/database/entities/token.entity'
import { type User, UserRole } from '../../src/core/database/entities/user.entity'
import type { TokenRepository, UserRepository } from '../../src/core/database/repositories'
import { OAuthService } from '../../src/oauth/oauth.service'

// Spec files are excluded from the app tsconfig, so `@core/*` / `@utils` aliases do not resolve here —
// import via relative paths (matching the other auth-service specs) and mock the module by its real path.
const { verifyPassword } = vi.hoisted(() => ({ verifyPassword: vi.fn() }))

vi.mock('../../src/common/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/common/utils')>()
  return { ...actual, verifyPassword }
})

vi.mock('uuid', () => ({
  v4: vi.fn().mockReturnValue('mock-uuid'),
}))

function createMockUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    name: 'alice',
    password: 'stored-hash',
    role: UserRole.Issuer,
    isDemoUser: vi.fn().mockReturnValue(false),
    ...overrides,
  } as unknown as User
}

// A refresh-token record as stored by TokenRepository: `payload` is a JSON string holding the paired access token
// See OAuthService.generateRefreshToken / classFromJson
function storedRefreshToken(accessToken: string, subject = 'user-1') {
  return { id: 'token-id', subject, payload: JSON.stringify({ accessToken }) }
}

function createMocks() {
  const userRepository = { findOne: vi.fn() } satisfies Partial<UserRepository>
  const transactionEm = { transactional: vi.fn((cb: () => Promise<unknown>) => cb()) }
  const tokenRepository = {
    put: vi.fn().mockResolvedValue({ id: 'token-id', token: 'stored-token' }),
    updateToken: vi.fn(),
    revoke: vi.fn(),
    get: vi.fn(),
    getById: vi.fn(),
    getEntityManager: vi.fn().mockReturnValue(transactionEm),
  } satisfies Partial<TokenRepository>
  const jwtService = {
    signAsync: vi.fn().mockResolvedValue('signed-jwt'),
    decode: vi.fn().mockReturnValue({ exp: 9999999999 }),
    verifyAsync: vi.fn(),
  } satisfies Partial<JwtService>
  const configService = {
    jwtConfig: {
      issuer: 'test-issuer',
      audience: 'test-audience',
      secret: 'test-secret',
      accessExpiry: 3600,
      refreshExpiry: 86400,
      demoUser: 'demo',
    },
    appConfig: { orgId: 'org-1' },
  }

  const service = new OAuthService(
    configService as unknown as ConfigService,
    jwtService as unknown as JwtService,
    userRepository as unknown as UserRepository,
    tokenRepository as unknown as TokenRepository,
  )

  return { service, userRepository, tokenRepository, jwtService, transactionEm }
}

describe('OAuthService', () => {
  let service: OAuthService
  let userRepository: ReturnType<typeof createMocks>['userRepository']
  let tokenRepository: ReturnType<typeof createMocks>['tokenRepository']
  let jwtService: ReturnType<typeof createMocks>['jwtService']
  let transactionEm: ReturnType<typeof createMocks>['transactionEm']

  beforeEach(() => {
    vi.clearAllMocks()
    ;({ service, userRepository, tokenRepository, jwtService, transactionEm } = createMocks())
  })

  describe('login', () => {
    it('should return tokens for valid credentials', async () => {
      userRepository.findOne.mockResolvedValue(createMockUser())
      verifyPassword.mockResolvedValue(true)
      // distinguish the two signAsync calls (access is signed first, then refresh)
      jwtService.signAsync.mockResolvedValueOnce('access-jwt').mockResolvedValueOnce('refresh-jwt')

      const result = await service.login({ name: 'alice', password: 'correct' })

      expect(userRepository.findOne).toHaveBeenCalledWith({ name: 'alice' }, { populate: ['password'] })
      expect(result).toEqual({
        access: 'access-jwt',
        refresh: 'refresh-jwt',
        tokenType: 'Bearer',
        expiresIn: 3600,
      })
      expect(tokenRepository.put).toHaveBeenCalledTimes(2)
    })

    it('should verify password with stored hash and input password', async () => {
      userRepository.findOne.mockResolvedValue(createMockUser({ password: 'argon2-hash' }))
      verifyPassword.mockResolvedValue(true)

      await service.login({ name: 'alice', password: 'user-input' })

      expect(verifyPassword).toHaveBeenCalledWith('argon2-hash', 'user-input')
    })

    it('should sign the access token with the user role, name and org scope', async () => {
      userRepository.findOne.mockResolvedValue(createMockUser())
      verifyPassword.mockResolvedValue(true)

      await service.login({ name: 'alice', password: 'correct' })

      // signAsync is called twice; the first call signs the access token
      expect(jwtService.signAsync).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ roles: [UserRole.Issuer], name: 'alice', type: 'access', org_id: 'org-1' }),
        expect.objectContaining({
          subject: 'user-1',
          expiresIn: 3600,
          issuer: 'test-issuer',
          audience: 'test-audience',
        }),
      )
    })

    it('should persist both access and refresh tokens with correct metadata', async () => {
      userRepository.findOne.mockResolvedValue(createMockUser())
      verifyPassword.mockResolvedValue(true)

      jwtService.signAsync.mockResolvedValueOnce('access-jwt').mockResolvedValueOnce('refresh-jwt')

      await service.login({ name: 'alice', password: 'correct' })

      expect(tokenRepository.put).toHaveBeenCalledTimes(2)
      // access token stored under the signed access JWT
      expect(tokenRepository.put).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ type: TokenType.AccessToken, subject: 'user-1', token: 'access-jwt' }),
      )
      // refresh record stored under a fresh uuid, with the paired access token in its payload
      expect(tokenRepository.put).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          type: TokenType.RefreshToken,
          subject: 'user-1',
          token: 'mock-uuid',
          payload: JSON.stringify({ accessToken: 'access-jwt' }),
        }),
      )
      // the signed refresh JWT is linked back to the record via updateToken
      expect(tokenRepository.updateToken).toHaveBeenCalledWith({ id: 'token-id', token: 'refresh-jwt' })
    })

    it('should use the demo-user token expiry for a demo user', async () => {
      userRepository.findOne.mockResolvedValue(createMockUser({ isDemoUser: vi.fn().mockReturnValue(true) }))
      verifyPassword.mockResolvedValue(true)

      const result = await service.login({ name: 'demo', password: 'correct' })

      expect(result.expiresIn).toBe(jwtConfigDefaults.demoUserTokenExpiry)
      // the demo expiry must also drive the signed access token, not just the returned value
      expect(jwtService.signAsync).toHaveBeenNthCalledWith(
        1,
        expect.any(Object),
        expect.objectContaining({ expiresIn: jwtConfigDefaults.demoUserTokenExpiry }),
      )
    })

    it('should throw UnauthorizedException when user does not exist', async () => {
      userRepository.findOne.mockResolvedValue(null)

      await expect(service.login({ name: 'ghost', password: 'any' })).rejects.toThrow(UnauthorizedException)

      expect(verifyPassword).not.toHaveBeenCalled()
      expect(tokenRepository.put).not.toHaveBeenCalled()
    })

    it('should throw UnauthorizedException when password is incorrect', async () => {
      userRepository.findOne.mockResolvedValue(createMockUser())
      verifyPassword.mockResolvedValue(false)

      await expect(service.login({ name: 'alice', password: 'wrong' })).rejects.toThrow(UnauthorizedException)

      expect(tokenRepository.put).not.toHaveBeenCalled()
    })

    it('should not persist or update any tokens on authentication failure', async () => {
      userRepository.findOne.mockResolvedValue(null)

      await expect(service.login({ name: 'ghost', password: 'any' })).rejects.toThrow()

      expect(tokenRepository.put).not.toHaveBeenCalled()
      expect(tokenRepository.updateToken).not.toHaveBeenCalled()
    })

    it('should not generate JWTs when authentication fails', async () => {
      userRepository.findOne.mockResolvedValue(createMockUser())
      verifyPassword.mockResolvedValue(false)

      await expect(service.login({ name: 'alice', password: 'wrong' })).rejects.toThrow()

      expect(jwtService.signAsync).not.toHaveBeenCalled()
    })
  })

  describe('refreshToken', () => {
    // a failed/unauthorized refresh must neither mint nor mutate any token
    const expectNoTokenSideEffects = () => {
      expect(jwtService.signAsync).not.toHaveBeenCalled()
      expect(tokenRepository.put).not.toHaveBeenCalled()
      expect(tokenRepository.updateToken).not.toHaveBeenCalled()
      expect(tokenRepository.revoke).not.toHaveBeenCalled()
    }

    it('should revoke the old tokens and regenerate for a valid refresh', async () => {
      jwtService.verifyAsync.mockResolvedValue({ jti: 'refresh-jti', exp: 9999999999 })
      tokenRepository.getById.mockResolvedValue(storedRefreshToken('old-access'))
      userRepository.findOne.mockResolvedValue(createMockUser())
      // distinguish the freshly-signed tokens from the old ones passed in
      jwtService.signAsync.mockResolvedValueOnce('new-access-jwt').mockResolvedValueOnce('new-refresh-jwt')

      const result = await service.refreshToken('old-access', 'old-refresh')

      expect(jwtService.verifyAsync.mock.calls[0]?.[0]).toBe('old-refresh')
      expect(tokenRepository.getById).toHaveBeenCalledWith('refresh-jti')
      expect(tokenRepository.revoke).toHaveBeenCalledWith('old-access')
      expect(tokenRepository.revoke).toHaveBeenCalledWith('old-refresh')
      expect(tokenRepository.put).toHaveBeenCalledTimes(2) // new access + refresh
      expect(result.tokenType).toBe('Bearer')
      expect(result.access).toBe('new-access-jwt')
      expect(result.refresh).toBe('new-refresh-jwt')
    })

    it('should return the same tokens without revoking for a demo user', async () => {
      jwtService.verifyAsync.mockResolvedValue({ jti: 'refresh-jti', exp: 9999999999 })
      tokenRepository.getById.mockResolvedValue(storedRefreshToken('old-access'))
      userRepository.findOne.mockResolvedValue(createMockUser({ isDemoUser: vi.fn().mockReturnValue(true) }))

      const result = await service.refreshToken('old-access', 'old-refresh')

      expect(result.access).toBe('old-access')
      expect(result.refresh).toBe('old-refresh')
      expect(tokenRepository.revoke).not.toHaveBeenCalled()
      expect(tokenRepository.put).not.toHaveBeenCalled()
    })

    it('should throw UnauthorizedException when the refresh token fails verification', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error('invalid signature'))

      await expect(service.refreshToken('any-access', 'bad-refresh')).rejects.toThrow(UnauthorizedException)

      expectNoTokenSideEffects()
    })

    it('should throw UnauthorizedException when the verified refresh token has no jti', async () => {
      jwtService.verifyAsync.mockResolvedValue({ exp: 9999999999 })

      await expect(service.refreshToken('any-access', 'no-jti-refresh')).rejects.toThrow(UnauthorizedException)

      expect(tokenRepository.getById).not.toHaveBeenCalled()
      expectNoTokenSideEffects()
    })

    it('should throw UnauthorizedException when the stored refresh token record is not found', async () => {
      jwtService.verifyAsync.mockResolvedValue({ jti: 'refresh-jti', exp: 9999999999 })
      tokenRepository.getById.mockResolvedValue(null)

      await expect(service.refreshToken('any-access', 'unknown-refresh')).rejects.toThrow(UnauthorizedException)

      expectNoTokenSideEffects()
    })

    it('should throw UnauthorizedException when the access token does not match the stored one', async () => {
      jwtService.verifyAsync.mockResolvedValue({ jti: 'refresh-jti', exp: 9999999999 })
      tokenRepository.getById.mockResolvedValue(storedRefreshToken('stored-access'))
      userRepository.findOne.mockResolvedValue(createMockUser())

      await expect(service.refreshToken('mismatched-access', 'old-refresh')).rejects.toThrow(UnauthorizedException)

      expectNoTokenSideEffects()
    })

    it('should throw UnauthorizedException when the user no longer exists', async () => {
      jwtService.verifyAsync.mockResolvedValue({ jti: 'refresh-jti', exp: 9999999999 })
      tokenRepository.getById.mockResolvedValue(storedRefreshToken('old-access'))
      userRepository.findOne.mockResolvedValue(null)

      await expect(service.refreshToken('old-access', 'old-refresh')).rejects.toThrow(UnauthorizedException)

      expectNoTokenSideEffects()
    })
  })

  describe('logout', () => {
    it('should revoke both the access and refresh tokens inside a transaction when the caller owns them', async () => {
      tokenRepository.get.mockResolvedValue(storedRefreshToken('stored-access'))
      userRepository.findOne.mockResolvedValue(createMockUser())

      await service.logout('stored-access', { refresh: 'refresh-token' })

      expect(transactionEm.transactional).toHaveBeenCalledTimes(1)
      expect(tokenRepository.revoke).toHaveBeenCalledWith('stored-access')
      expect(tokenRepository.revoke).toHaveBeenCalledWith('refresh-token')
    })

    it('should abort the transaction and surface the error when revoking a token fails', async () => {
      tokenRepository.get.mockResolvedValue(storedRefreshToken('stored-access'))
      userRepository.findOne.mockResolvedValue(createMockUser())
      const failure = new Error('db unavailable')
      tokenRepository.revoke.mockRejectedValueOnce(failure)

      await expect(service.logout('stored-access', { refresh: 'refresh-token' })).rejects.toThrow(failure)

      // the first revoke rejected inside the transactional callback, so the second never ran
      expect(tokenRepository.revoke).toHaveBeenCalledTimes(1)
    })

    it('should reject revoking a refresh token the caller does not own', async () => {
      tokenRepository.get.mockResolvedValue(storedRefreshToken('stored-access'))

      await expect(service.logout('another-users-access', { refresh: 'refresh-token' })).rejects.toThrow(
        UnauthorizedException,
      )

      // ownership is checked before any user lookup or revocation
      expect(userRepository.findOne).not.toHaveBeenCalled()
      expect(tokenRepository.revoke).not.toHaveBeenCalled()
    })

    it('should skip revocation for a demo user', async () => {
      tokenRepository.get.mockResolvedValue(storedRefreshToken('stored-access'))
      userRepository.findOne.mockResolvedValue(createMockUser({ isDemoUser: vi.fn().mockReturnValue(true) }))

      await service.logout('stored-access', { refresh: 'refresh-token' })

      expect(tokenRepository.revoke).not.toHaveBeenCalled()
    })

    it('should be a no-op when the refresh token is unknown', async () => {
      tokenRepository.get.mockResolvedValue(null)

      await expect(service.logout('any-access', { refresh: 'unknown' })).resolves.toBeUndefined()

      expect(userRepository.findOne).not.toHaveBeenCalled()
      expect(tokenRepository.revoke).not.toHaveBeenCalled()
    })
  })
})
