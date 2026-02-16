import { UnauthorizedException } from '@nestjs/common'

import { Role } from 'common/auth'

export function getWalletId({ role, userId, orgId }: { role: Role; userId: string; orgId?: string }): string {
  switch (role) {
    case Role.Admin:
      if (orgId) {
        throw new UnauthorizedException()
      }
      // FIXME: In web app demo we create users with `Admin` role
      return `Administration_${userId}`
    case Role.OrgAdmin:
    case Role.OrgManager:
    case Role.OrgMember:
      if (!orgId) {
        throw new UnauthorizedException()
      }
      return `Organization_${orgId}`
    case Role.Issuer:
    case Role.Verifier:
      if (!orgId) {
        throw new UnauthorizedException()
      }
      return `${role}_${userId}_in_Organization_${orgId}`
    case Role.User:
      if (orgId) {
        throw new UnauthorizedException()
      }
      return `${role}_${userId}`
    default:
      throw new Error(`Role '${role}' is not supported`)
  }
}

export function getDidControllerWalletId({ role, orgId }: { role: Role; orgId?: string }): string | null {
  switch (role) {
    case Role.Admin:
      if (orgId) {
        throw new UnauthorizedException()
      }
      return null
    case Role.OrgAdmin:
      if (!orgId) {
        throw new UnauthorizedException()
      }
      return `Administration`
    case Role.Issuer:
      if (!orgId) {
        throw new UnauthorizedException()
      }
      return `Organization_${orgId}`
    default:
      throw new Error(`Cannot get DID controller because '${role}' role does not support public DID creation`)
  }
}
