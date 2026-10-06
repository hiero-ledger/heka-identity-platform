import { User, UserRole } from '@core/database'
import { UserRepository } from '@core/database/repositories'
import { LockMode, QueryOrder } from '@mikro-orm/core'
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'

import { ListUsersResponse, UpdateUserRoleRequest, UserRoleItem } from './dto'

// Roles within the organization configured by `ORG_ID`
export const ORGANIZATION_ROLES: readonly UserRole[] = [
  UserRole.OrgAdmin,
  UserRole.OrgManager,
  UserRole.OrgMember,
  UserRole.Issuer,
  UserRole.Verifier,
]

/**
 * Role assignment. An `Admin` assigns any role. An `OrgAdmin` assigns organization roles, to organization members
 * and to users who are not in the organization yet. Nobody changes their own role, so the last `Admin` stays.
 * Role changes lock the rows of the sender and the target and re-check the sender's current role, so two `Admin`s
 * demoting each other at the same time can't remove every `Admin`.
 */
@Injectable()
export class UserRoleService {
  public constructor(private readonly userRepository: UserRepository) {}

  public async list(sender: User): Promise<ListUsersResponse> {
    const users = await this.userRepository.find(
      { role: { $in: this.manageableRoles(sender) } },
      { orderBy: { name: 'asc' } },
    )
    return new ListUsersResponse(users.map((user) => new UserRoleItem(user)))
  }

  public async updateRole(sender: User, userId: string, data: UpdateUserRoleRequest): Promise<UserRoleItem> {
    // Rejects senders who cannot manage roles before touching the database
    this.manageableRoles(sender)

    if (sender.id === userId) {
      throw new ForbiddenException('Users cannot change their own role')
    }

    return this.userRepository.getEntityManager().transactional(async (em) => {
      // Lock both rows in a fixed order and read the sender's role again: a concurrent request may have changed it
      const users = await em.find(
        User,
        { id: { $in: [sender.id, userId] } },
        { lockMode: LockMode.PESSIMISTIC_WRITE, orderBy: { id: QueryOrder.ASC }, refresh: true },
      )
      const currentSender = users.find((user) => user.id === sender.id)
      if (!currentSender) {
        throw new ForbiddenException('The sender no longer exists')
      }
      const manageableRoles = this.manageableRoles(currentSender)

      const user = users.find((user) => user.id === userId)
      if (!user || !manageableRoles.includes(user.role)) {
        throw new NotFoundException(`User ${userId} not found`)
      }

      if (!this.assignableRoles(currentSender).includes(data.role)) {
        throw new ForbiddenException(`Role '${currentSender.role}' cannot assign the '${data.role}' role`)
      }

      // Flushed when the transaction commits
      user.role = data.role

      return new UserRoleItem(user)
    })
  }

  // Roles of the users the sender may see and change
  private manageableRoles(sender: User): readonly UserRole[] {
    switch (sender.role) {
      case UserRole.Admin:
        return Object.values(UserRole)
      case UserRole.OrgAdmin:
        return [...ORGANIZATION_ROLES, UserRole.User]
      default:
        throw new ForbiddenException(`Role '${sender.role}' cannot manage user roles`)
    }
  }

  private assignableRoles(sender: User): readonly UserRole[] {
    return sender.role === UserRole.Admin ? Object.values(UserRole) : ORGANIZATION_ROLES
  }
}
