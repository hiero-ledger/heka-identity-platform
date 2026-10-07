import { LockMode, QueryOrder } from '@mikro-orm/core'
import { ForbiddenException, NotFoundException } from '@nestjs/common'

import { User, UserRole } from '../../src/core/database/entities/user.entity'
import type { UserRepository } from '../../src/core/database/repositories'
import { ORGANIZATION_ROLES, UserRoleService } from '../../src/user/user-role.service'

function createUser(id: string, role: UserRole): User {
  return { id, name: `${role.toLowerCase()}-${id}`, role } as unknown as User
}

describe('UserRoleService', () => {
  const admin = createUser('admin-1', UserRole.Admin)
  const orgAdmin = createUser('org-admin-1', UserRole.OrgAdmin)

  let service: UserRoleService
  let userRepository: {
    find: ReturnType<typeof vi.fn>
    getEntityManager: ReturnType<typeof vi.fn>
  }
  // Entity manager of the role update transaction
  let em: { transactional: ReturnType<typeof vi.fn>; find: ReturnType<typeof vi.fn> }

  // Rows returned by the locking query of the transaction
  const lockedRows = (...users: User[]) => em.find.mockResolvedValue(users)

  beforeEach(() => {
    em = { transactional: vi.fn(), find: vi.fn().mockResolvedValue([]) }
    em.transactional.mockImplementation((callback: (transactionEm: typeof em) => Promise<unknown>) => callback(em))
    userRepository = { find: vi.fn().mockResolvedValue([]), getEntityManager: vi.fn().mockReturnValue(em) }
    service = new UserRoleService(userRepository as unknown as UserRepository)
  })

  describe('list', () => {
    it('lists every user for an Admin', async () => {
      userRepository.find.mockResolvedValue([admin, orgAdmin])

      const result = await service.list(admin)

      expect(userRepository.find).toHaveBeenCalledWith(
        { role: { $in: Object.values(UserRole) } },
        { orderBy: { name: 'asc' } },
      )
      expect(result.items).toEqual([
        { id: 'admin-1', name: admin.name, role: UserRole.Admin },
        { id: 'org-admin-1', name: orgAdmin.name, role: UserRole.OrgAdmin },
      ])
    })

    it('lists organization members and users outside the organization for an OrgAdmin', async () => {
      await service.list(orgAdmin)

      expect(userRepository.find).toHaveBeenCalledWith(
        { role: { $in: [...ORGANIZATION_ROLES, UserRole.User] } },
        { orderBy: { name: 'asc' } },
      )
    })

    it.each([UserRole.OrgManager, UserRole.OrgMember, UserRole.Issuer, UserRole.Verifier, UserRole.User])(
      'forbids a %s',
      async (role) => {
        await expect(service.list(createUser('sender', role))).rejects.toThrow(ForbiddenException)
        expect(userRepository.find).not.toHaveBeenCalled()
      },
    )
  })

  describe('updateRole', () => {
    it.each(Object.values(UserRole))('lets an Admin assign the %s role', async (role) => {
      const user = createUser('user-1', UserRole.User)
      lockedRows(admin, user)

      const result = await service.updateRole(admin, 'user-1', { role })

      expect(user.role).toBe(role)
      expect(em.transactional).toHaveBeenCalledTimes(1)
      expect(result).toEqual({ id: 'user-1', name: user.name, role })
    })

    it('locks the sender and the target in a fixed order and re-reads them', async () => {
      lockedRows(admin, createUser('user-1', UserRole.User))

      await service.updateRole(admin, 'user-1', { role: UserRole.Issuer })

      expect(em.find).toHaveBeenCalledWith(
        User,
        { id: { $in: ['admin-1', 'user-1'] } },
        { lockMode: LockMode.PESSIMISTIC_WRITE, orderBy: { id: QueryOrder.ASC }, refresh: true },
      )
    })

    it.each(ORGANIZATION_ROLES)(
      'lets an OrgAdmin assign the %s role to a user outside the organization',
      async (role) => {
        const user = createUser('user-1', UserRole.User)
        lockedRows(orgAdmin, user)

        await service.updateRole(orgAdmin, 'user-1', { role })

        expect(user.role).toBe(role)
      },
    )

    it.each([UserRole.Admin, UserRole.User])('forbids an OrgAdmin to assign the %s role', async (role) => {
      const user = createUser('user-1', UserRole.Issuer)
      lockedRows(orgAdmin, user)

      await expect(service.updateRole(orgAdmin, 'user-1', { role })).rejects.toThrow(ForbiddenException)
      expect(user.role).toBe(UserRole.Issuer)
    })

    it('hides an Admin from an OrgAdmin', async () => {
      const otherAdmin = createUser('admin-2', UserRole.Admin)
      lockedRows(otherAdmin, orgAdmin)

      await expect(service.updateRole(orgAdmin, 'admin-2', { role: UserRole.OrgMember })).rejects.toThrow(
        NotFoundException,
      )
      expect(otherAdmin.role).toBe(UserRole.Admin)
    })

    it('returns 404 for an unknown user', async () => {
      lockedRows(admin)

      await expect(service.updateRole(admin, 'missing', { role: UserRole.Issuer })).rejects.toThrow(NotFoundException)
    })

    it('forbids a sender whose role was changed in the meantime', async () => {
      // The request was authenticated as an Admin, but another Admin demoted the sender before the rows were locked
      const staleSender = createUser('admin-1', UserRole.Admin)
      const otherAdmin = createUser('admin-2', UserRole.Admin)
      lockedRows(createUser('admin-1', UserRole.User), otherAdmin)

      await expect(service.updateRole(staleSender, 'admin-2', { role: UserRole.User })).rejects.toThrow(
        ForbiddenException,
      )
      expect(otherAdmin.role).toBe(UserRole.Admin)
    })

    it('forbids a sender who no longer exists', async () => {
      const user = createUser('user-1', UserRole.User)
      lockedRows(user)

      await expect(service.updateRole(admin, 'user-1', { role: UserRole.Issuer })).rejects.toThrow(ForbiddenException)
      expect(user.role).toBe(UserRole.User)
    })

    it.each([admin, orgAdmin])('forbids changing your own role ($role)', async (sender) => {
      await expect(service.updateRole(sender, sender.id, { role: UserRole.Issuer })).rejects.toThrow(ForbiddenException)
      expect(em.transactional).not.toHaveBeenCalled()
    })

    it.each([UserRole.OrgManager, UserRole.Issuer, UserRole.User])('forbids a %s', async (role) => {
      await expect(service.updateRole(createUser('sender', role), 'user-1', { role: UserRole.Issuer })).rejects.toThrow(
        ForbiddenException,
      )
      expect(em.transactional).not.toHaveBeenCalled()
    })
  })
})
