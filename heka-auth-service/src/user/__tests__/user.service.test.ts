import { User, UserRole } from '@core/database'
import { TokenRepository, UserRepository } from '@core/database/repositories'
import { BadRequestException, NotFoundException } from '@nestjs/common'

import { UserService } from '../user.service'

describe('UserService', () => {
  let userRepository: jest.Mocked<UserRepository>
  let tokenRepository: jest.Mocked<TokenRepository>
  let service: UserService

  beforeEach(() => {
    userRepository = {
      findOne: jest.fn(),
      count: jest.fn(),
      persistAndFlush: jest.fn(),
    } as unknown as jest.Mocked<UserRepository>

    tokenRepository = {} as jest.Mocked<TokenRepository>

    service = new UserService(
      {} as never, // ConfigService — not needed for updateUserRole
      userRepository,
      tokenRepository,
    )
  })

  describe('updateUserRole', () => {
    const TARGET_ID = 'target-uuid'
    const REQUESTER_ID = 'requester-uuid'

    it('should throw NotFoundException when the target user does not exist', async () => {
      userRepository.findOne.mockResolvedValue(null)

      await expect(service.updateUserRole(REQUESTER_ID, TARGET_ID, UserRole.Issuer)).rejects.toThrow(NotFoundException)
      expect(userRepository.findOne).toHaveBeenCalledWith({ id: TARGET_ID })
    })

    it('should throw BadRequestException when the sole admin tries to remove their own admin role', async () => {
      const adminUser = new User({ id: TARGET_ID, name: 'admin', role: UserRole.Admin })
      userRepository.findOne.mockResolvedValue(adminUser)
      userRepository.count.mockResolvedValue(1)

      await expect(service.updateUserRole(TARGET_ID, TARGET_ID, UserRole.User)).rejects.toThrow(BadRequestException)
      expect(userRepository.count).toHaveBeenCalledWith({ role: UserRole.Admin })
      expect(userRepository.persistAndFlush).not.toHaveBeenCalled()
    })

    it('should allow admin to demote themselves when other admins exist', async () => {
      const adminUser = new User({ id: TARGET_ID, name: 'admin', role: UserRole.Admin })
      userRepository.findOne.mockResolvedValue(adminUser)
      // 2 admins in DB — guard must NOT trigger
      userRepository.count.mockResolvedValue(2)
      userRepository.persistAndFlush.mockResolvedValue(undefined)

      await expect(service.updateUserRole(TARGET_ID, TARGET_ID, UserRole.User)).resolves.not.toThrow()

      expect(userRepository.count).toHaveBeenCalledWith({ role: UserRole.Admin })
      expect(adminUser.role).toBe(UserRole.User)
      expect(userRepository.persistAndFlush).toHaveBeenCalledWith(adminUser)
    })

    it('should update another user role without triggering the self-demotion guard', async () => {
      const targetUser = new User({ id: TARGET_ID, name: 'target', role: UserRole.User })
      userRepository.findOne.mockResolvedValue(targetUser)
      userRepository.persistAndFlush.mockResolvedValue(undefined)

      const result = await service.updateUserRole(REQUESTER_ID, TARGET_ID, UserRole.Issuer)

      expect(userRepository.count).not.toHaveBeenCalled()
      expect(targetUser.role).toBe(UserRole.Issuer)
      expect(userRepository.persistAndFlush).toHaveBeenCalledWith(targetUser)
      expect(result.id).toBe(TARGET_ID)
      expect(result.role).toBe(UserRole.Issuer)
    })
  })
})
