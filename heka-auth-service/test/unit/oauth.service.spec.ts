import { UnauthorizedException } from '@nestjs/common'

import { UserRole } from '@core/database'
import { TokenType } from '@core/database/entities/token.entity'

import { OAuthService } from '../../src/oauth/oauth.service'

const verifyPassword = jest.fn()

jest.mock('@utils', () => ({
  verifyPassword: (...args: unknown[]) => verifyPassword(...args),
  ExpiresInToDate: jest.fn().mockReturnValue(new Date('2099-01-01')),
  SecondsToDate: jest.fn().mockReturnValue(new Date('2099-01-01')),
  classFromJson: jest.fn(),
}))

jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('mock-uuid'),
}))

function createMockUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    name: 'alice',
    password: 'stored-hash',
    role: UserRole.Issuer,
    isDemoUser: jest.fn().mockReturnValue(false),
    ...overrides,
  }
}

function createMocks() {
  const userRepository = { findOne: jest.fn() }
  const tokenRepository = {
    put: jest.fn().mockResolvedValue({ id: 'token-id', token: 'stored-token' }),
    updateToken: jest.fn(),
    revoke: jest.fn(),
    get: jest.fn(),
    getById: jest.fn(),
  }
  const jwtService = {
    signAsync: jest.fn().mockResolvedValue('signed-jwt'),
    decode: jest.fn().mockReturnValue({ exp: 9999999999 }),
    verifyAsync: jest.fn(),
  }
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
    configService as any,
    jwtService as any,
    userRepository as any,
    tokenRepository as any,
  )

  return { service, userRepository, tokenRepository, jwtService }
}

describe('OAuthService', () => {
  let service: OAuthService
  let userRepository: ReturnType<typeof createMocks>['userRepository']
  let tokenRepository: ReturnType<typeof createMocks>['tokenRepository']
  let jwtService: ReturnType<typeof createMocks>['jwtService']

  beforeEach(() => {
    jest.clearAllMocks()
    ;({ service, userRepository, tokenRepository, jwtService } = createMocks())
  })

  describe('login', () => {
    // ── Happy path ────────────────────────────────────────────────────

    it('should return tokens for valid credentials', async () => {
      userRepository.findOne.mockResolvedValue(createMockUser())
      verifyPassword.mockResolvedValue(true)

      const result = await service.login({ name: 'alice', password: 'correct' })

      expect(verifyPassword).toHaveBeenCalled()
      expect(jwtService.signAsync).toHaveBeenCalled()
      expect(tokenRepository.put).toHaveBeenCalled()
      expect(result.tokenType).toBe('Bearer')
    })

    it('should verify password with stored hash and input password', async () => {
      userRepository.findOne.mockResolvedValue(createMockUser({ password: 'argon2-hash' }))
      verifyPassword.mockResolvedValue(true)

      await service.login({ name: 'alice', password: 'user-input' })

      expect(verifyPassword).toHaveBeenCalledWith('argon2-hash', 'user-input')
    })

    it('should persist both access and refresh tokens with correct metadata', async () => {
      userRepository.findOne.mockResolvedValue(createMockUser())
      verifyPassword.mockResolvedValue(true)

      await service.login({ name: 'alice', password: 'correct' })

      expect(tokenRepository.put).toHaveBeenCalledWith(
        expect.objectContaining({ type: TokenType.AccessToken, subject: 'user-1' }),
      )
      expect(tokenRepository.put).toHaveBeenCalledWith(
        expect.objectContaining({ type: TokenType.RefreshToken, subject: 'user-1' }),
      )
    })

    it('should return response matching Token contract', async () => {
      userRepository.findOne.mockResolvedValue(createMockUser())
      verifyPassword.mockResolvedValue(true)

      const result = await service.login({ name: 'alice', password: 'correct' })

      expect(result).toEqual(
        expect.objectContaining({
          access: expect.any(String),
          refresh: expect.any(String),
          tokenType: 'Bearer',
          expiresIn: expect.any(Number),
        }),
      )
    })

    // ── Failure paths ─────────────────────────────────────────────────

    it('should throw UnauthorizedException when user does not exist', async () => {
      userRepository.findOne.mockResolvedValue(null)

      await expect(service.login({ name: 'ghost', password: 'any' })).rejects.toThrow(
        UnauthorizedException,
      )

      expect(verifyPassword).not.toHaveBeenCalled()
      expect(tokenRepository.put).not.toHaveBeenCalled()
    })

    it('should throw UnauthorizedException when password is incorrect', async () => {
      userRepository.findOne.mockResolvedValue(createMockUser())
      verifyPassword.mockResolvedValue(false)

      await expect(service.login({ name: 'alice', password: 'wrong' })).rejects.toThrow(
        UnauthorizedException,
      )

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
})
