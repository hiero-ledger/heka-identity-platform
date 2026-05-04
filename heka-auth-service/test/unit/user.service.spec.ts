import { BadRequestException } from '@nestjs/common'

import { UserRole } from '@core/database'

import { UserService } from '../../src/user/user.service'

const hashPassword = jest.fn().mockResolvedValue('hashed-password')

jest.mock('@utils', () => ({
  hashPassword: (...args: unknown[]) => hashPassword(...args),
  verifyPassword: jest.fn(),
  ExpiresInToDate: jest.fn(),
}))

describe('UserService.register', () => {
  let service: UserService
  let userRepository: { findOne: jest.Mock; persistAndFlush: jest.Mock }

  beforeEach(() => {
    userRepository = {
      findOne: jest.fn(),
      persistAndFlush: jest.fn(),
    }

    service = new UserService(
      {} as any,
      userRepository as any,
      {} as any,
    )

    jest.clearAllMocks()
  })

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

    const persistedUser = userRepository.persistAndFlush.mock.calls[0][0]
    expect(persistedUser.password).toBe('hashed-password')
    expect(result).toBeDefined()
  })

  it('should throw BadRequestException when username already exists', async () => {
    userRepository.findOne.mockResolvedValue({ id: '1', name: 'alice' })

    await expect(
      service.register({ name: 'alice', password: 'StrongP@ss1' }),
    ).rejects.toThrow(BadRequestException)

    expect(userRepository.persistAndFlush).not.toHaveBeenCalled()
  })

  it('should default to User role when no role is provided', async () => {
    userRepository.findOne.mockResolvedValue(null)

    await service.register({ name: 'bob', password: 'StrongP@ss1' })

    const persistedUser = userRepository.persistAndFlush.mock.calls[0][0]
    expect(persistedUser.role).toBe(UserRole.User)
  })
})
