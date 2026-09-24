import { Role } from 'common/auth'

/**
 * What an actor may do. Every non-public endpoint requires exactly one capability, and operations
 * that belong to another capability check it where they run (see `AuthorizationService`).
 */
export enum Capability {
  Read = 'read',
  Profile = 'profile',
  Hold = 'hold',
  Connect = 'connect',
  Did = 'did',
  Prepare = 'prepare',
  Issue = 'issue',
  Verify = 'verify',
}

const ALL_ROLES = Object.values(Role)

export const CAPABILITY_ROLES: Record<Capability, readonly Role[]> = {
  [Capability.Read]: ALL_ROLES,
  [Capability.Profile]: ALL_ROLES,
  [Capability.Hold]: ALL_ROLES,
  [Capability.Connect]: [Role.Admin, Role.OrgAdmin, Role.OrgManager, Role.Issuer, Role.Verifier],
  [Capability.Did]: [Role.Admin, Role.OrgAdmin, Role.Issuer, Role.Verifier],
  [Capability.Prepare]: [Role.Admin, Role.OrgAdmin, Role.OrgManager, Role.Issuer, Role.Verifier],
  [Capability.Issue]: [Role.Admin, Role.OrgAdmin, Role.OrgManager, Role.Issuer],
  [Capability.Verify]: [Role.Admin, Role.OrgAdmin, Role.OrgManager, Role.Verifier],
}
