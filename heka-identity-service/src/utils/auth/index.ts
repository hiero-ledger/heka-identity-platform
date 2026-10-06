import { ForbiddenException, UnauthorizedException } from '@nestjs/common'

import { Role } from 'common/auth'

export const ADMINISTRATION_WALLET_ID = 'Administration'

export function getOrganizationWalletId(orgId: string): string {
  return `Organization_${orgId}`
}

export function getWalletId({ role, userId, orgId }: { role: Role; userId: string; orgId?: string }): string {
  switch (role) {
    case Role.Admin:
      if (orgId) {
        throw new UnauthorizedException()
      }
      // Every Admin acts in the shared administration wallet
      return ADMINISTRATION_WALLET_ID
    case Role.OrgAdmin:
    case Role.OrgManager:
    case Role.OrgMember:
      if (!orgId) {
        throw new UnauthorizedException()
      }
      return getOrganizationWalletId(orgId)
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
      throw new UnauthorizedException()
  }
}

/**
 * The wallet whose DID controls the public DIDs this role creates (with the role model enabled): `Administration`
 * controls organization DIDs, an organization controls its issuers' DIDs, and Admin DIDs are self-controlled.
 * Roles that cannot create a public DID are rejected.
 */
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
      return ADMINISTRATION_WALLET_ID
    case Role.Issuer:
      if (!orgId) {
        throw new UnauthorizedException()
      }
      return getOrganizationWalletId(orgId)
    default:
      throw new ForbiddenException(`Role '${role}' cannot create a public DID`)
  }
}
