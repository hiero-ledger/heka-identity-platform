import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common'

import type { ConfigService } from '../../src/core/config'
import { TokenType } from '../../src/core/database/entities/token.entity'
import { type User, UserRole } from '../../src/core/database/entities/user.entity'
import type { TokenRepository, UserRepository } from '../../src/core/database/repositories'
import { UserService } from '../../src/user/user.service'

// Spec files are excluded from the app tsconfig, so `@core/*` / `@utils` aliases do not resolve here —
// import via relative paths (matching the other auth-service specs) and mock the module by its real path.
const { hashPassword, verifyPassword } = vi.hoisted(() => ({
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
}))

vi.mock('../../src/common/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/common/utils')>()
  return { ...actual, hashPassword, verifyPassword }
})

vi.mock('uuid', () => ({
  v4: vi.fn().mockReturnValue('mock-uuid'),
}))

function createUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    name: 'alice',
    password: 'stored-hash',
    role: UserRole.Issuer,
    ...overrides,
  } as unknown as User
}

function createMocks() {
  const userRepository = {
    findOne: vi.fn(),
    persistAndFlush: vi.fn(),
  } satisfies Partial<UserRepository>

  const tokenRepository = {
    put: vi.fn().mockResolvedValue({ token: 'password-change-token' }),
    get: vi.fn(),
    revoke: vi.fn(),
    revokeByTypeAndSubject: vi.fn(),
  } satisfies Partial<TokenRepository>

  const configService = {
    expireInConfig: { passwordChange: 3600 },
  }

  const service = new UserService(
    configService as unknown as ConfigService,
    userRepository as unknown as UserRepository,
    tokenRepository as unknown as TokenRepository,
  )

  return { service, userRepository, tokenRepository }
}

describe('UserService', () => {
  let service: UserService
  let userRepository: ReturnType<typeof createMocks>['userRepository']
  let tokenRepository: ReturnType<typeof createMocks>['tokenRepository']

  beforeEach(() => {
    vi.clearAllMocks()
    hashPassword.mockResolvedValue('hashed-password')
    ;({ service, userRepository, tokenRepository } = createMocks())
  })

  describe('register', () => {
    it('should register a new user with a hashed password', async () => {
      userRepository.findOne.mockResolvedValue(null)

      const result = await service.register({
        name: 'alice',
        password: 'StrongP@ss1',
        role: UserRole.Issuer,
      })

      expect(userRepository.findOne).toHaveBeenCalledWith({ name: 'alice' })
      expect(hashPassword).toHaveBeenCalledWith('StrongP@ss1')
      expect(userRepository.persistAndFlush).toHaveBeenCalledTimes(1)

      const persistedUser = userRepository.persistAndFlush.mock.calls[0]?.[0]
      expect(persistedUser?.name).toBe('alice')
      expect(persistedUser?.password).toBe('hashed-password')
      expect(persistedUser?.role).toBe(UserRole.Issuer)
      expect(result).toBeDefined()
    })

    it('should throw BadRequestException when username already exists', async () => {
      userRepository.findOne.mockResolvedValue({ id: '1', name: 'alice' })

      await expect(service.register({ name: 'alice', password: 'StrongP@ss1' })).rejects.toThrow(BadRequestException)

      // duplicate check must short-circuit before hashing or persisting
      expect(hashPassword).not.toHaveBeenCalled()
      expect(userRepository.persistAndFlush).not.toHaveBeenCalled()
    })

    it('should default to User role when no role is provided', async () => {
      userRepository.findOne.mockResolvedValue(null)

      await service.register({ name: 'bob', password: 'StrongP@ss1' })

      const persistedUser = userRepository.persistAndFlush.mock.calls[0]?.[0]
      expect(persistedUser?.role).toBe(UserRole.User)
    })
  })

  describe('requestChangePassword', () => {
    it('should revoke any prior token and issue a fresh password-change token for valid credentials', async () => {
      userRepository.findOne.mockResolvedValue(createUser({ id: 'user-1', password: 'stored-hash' }))
      verifyPassword.mockResolvedValue(true)

      const result = await service.requestChangePassword({ name: 'alice', oldPassword: 'OldP@ss1' })

      expect(userRepository.findOne).toHaveBeenCalledWith({ name: 'alice' }, { populate: ['password'] })
      expect(verifyPassword).toHaveBeenCalledWith('stored-hash', 'OldP@ss1')
      expect(tokenRepository.revokeByTypeAndSubject).toHaveBeenCalledWith(TokenType.PasswordChangeToken, 'user-1')

      const putArg = tokenRepository.put.mock.calls[0]?.[0]
      expect(putArg).toMatchObject({ type: TokenType.PasswordChangeToken, token: 'mock-uuid', subject: 'user-1' })
      expect(putArg?.expireIn).toBeInstanceOf(Date)
      expect(result.token).toBe('password-change-token')
    })

    it('should throw ForbiddenException when the user does not exist', async () => {
      userRepository.findOne.mockResolvedValue(null)

      await expect(service.requestChangePassword({ name: 'ghost', oldPassword: 'OldP@ss1' })).rejects.toThrow(
        ForbiddenException,
      )

      expect(verifyPassword).not.toHaveBeenCalled()
      expect(tokenRepository.revokeByTypeAndSubject).not.toHaveBeenCalled()
      expect(tokenRepository.put).not.toHaveBeenCalled()
    })

    it('should throw UnauthorizedException when the old password is incorrect', async () => {
      userRepository.findOne.mockResolvedValue(createUser({ id: 'user-1', password: 'stored-hash' }))
      verifyPassword.mockResolvedValue(false)

      await expect(service.requestChangePassword({ name: 'alice', oldPassword: 'WrongP@ss1' })).rejects.toThrow(
        UnauthorizedException,
      )

      // no token side effects when the current password check fails
      expect(tokenRepository.revokeByTypeAndSubject).not.toHaveBeenCalled()
      expect(tokenRepository.put).not.toHaveBeenCalled()
    })
  })

  describe('changePassword', () => {
    const validToken = () => ({ token: 'change-token', type: TokenType.PasswordChangeToken, subject: 'user-1' })

    it('should hash the new password, persist the user, and consume the token', async () => {
      tokenRepository.get.mockResolvedValue(validToken())
      userRepository.findOne.mockResolvedValue(createUser({ id: 'user-1' }))

      await service.changePassword({ token: 'change-token', password: 'NewP@ss1' })

      expect(tokenRepository.get).toHaveBeenCalledWith('change-token')
      expect(userRepository.findOne).toHaveBeenCalledWith({ id: 'user-1' })
      expect(hashPassword).toHaveBeenCalledWith('NewP@ss1')

      const persistedUser = userRepository.persistAndFlush.mock.calls[0]?.[0]
      expect(persistedUser?.password).toBe('hashed-password')
      expect(tokenRepository.revoke).toHaveBeenCalledWith('change-token')
    })

    it('should throw ForbiddenException when the token is not found', async () => {
      tokenRepository.get.mockResolvedValue(null)

      await expect(service.changePassword({ token: 'missing', password: 'NewP@ss1' })).rejects.toThrow(
        ForbiddenException,
      )

      expect(userRepository.findOne).not.toHaveBeenCalled()
      expect(hashPassword).not.toHaveBeenCalled()
      expect(userRepository.persistAndFlush).not.toHaveBeenCalled()
      expect(tokenRepository.revoke).not.toHaveBeenCalled()
    })

    it('should throw ForbiddenException when the token is not a password-change token', async () => {
      tokenRepository.get.mockResolvedValue({ ...validToken(), type: TokenType.AccessToken })

      await expect(service.changePassword({ token: 'change-token', password: 'NewP@ss1' })).rejects.toThrow(
        ForbiddenException,
      )

      expect(userRepository.findOne).not.toHaveBeenCalled()
      expect(hashPassword).not.toHaveBeenCalled()
      expect(userRepository.persistAndFlush).not.toHaveBeenCalled()
    })

    it('should throw ForbiddenException when the token subject no longer exists', async () => {
      tokenRepository.get.mockResolvedValue({ ...validToken(), subject: 'ghost' })
      userRepository.findOne.mockResolvedValue(null)

      await expect(service.changePassword({ token: 'change-token', password: 'NewP@ss1' })).rejects.toThrow(
        ForbiddenException,
      )

      expect(hashPassword).not.toHaveBeenCalled()
      expect(userRepository.persistAndFlush).not.toHaveBeenCalled()
      expect(tokenRepository.revoke).not.toHaveBeenCalled()
    })
  })
})
