import { ForbiddenException, UnauthorizedException } from '@nestjs/common'

import { Role } from 'common/auth'

export const ADMINISTRATION_WALLET_ID = 'Administration'

export function getOrganizationWalletId(orgId: string): string {
  return `Organization_${orgId}`
}

/**
 * The wallet a token acts in. It depends only on the token, never on the role model mode:
 * - `Admin`: the platform identity wallet, shared by every Admin;
 * - `OrgAdmin` / `OrgManager`: the organization identity wallet;
 * - `OrgMember` / `Issuer` / `Verifier`: the member's personal wallet in the organization, the same for all three roles;
 * - `User`: the holder's personal wallet.
 */
export function getWalletId({ role, userId, orgId }: { role: Role; userId: string; orgId?: string }): string {
  switch (role) {
    case Role.Admin:
      if (orgId) {
        throw new UnauthorizedException()
      }
      return ADMINISTRATION_WALLET_ID
    case Role.OrgAdmin:
    case Role.OrgManager:
      if (!orgId) {
        throw new UnauthorizedException()
      }
      return getOrganizationWalletId(orgId)
    case Role.OrgMember:
    case Role.Issuer:
    case Role.Verifier:
      if (!orgId) {
        throw new UnauthorizedException()
      }
      return `Member_${userId}_in_Organization_${orgId}`
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
 * The wallet whose public DID must exist before this role may create one. It is an authorization
 * prerequisite only: the DID is always created in the caller's own wallet.
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
    case Role.Verifier:
      if (!orgId) {
        throw new UnauthorizedException()
      }
      return getOrganizationWalletId(orgId)
    default:
      throw new ForbiddenException(`Role '${role}' cannot create a public DID`)
  }
}

/**
 * Whether the role administers the wallet it acts in, i.e. may write the wallet's issuer display.
 * Personal wallets are administered by their only user; `OrgManager` operates the organization
 * wallet without administering it.
 */
export function administersWallet(role: Role): boolean {
  return role !== Role.OrgManager
}
