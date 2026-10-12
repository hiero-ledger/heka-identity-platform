import { Role } from 'common/auth'

/** Heka roles an `OrgAdmin` may assign: the roles that act inside an organization. */
export const ORGANIZATION_ROLES = [Role.OrgAdmin, Role.OrgManager, Role.OrgMember, Role.Issuer, Role.Verifier] as const
export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number]

export const isOrganizationRole = (role: unknown): role is OrganizationRole =>
  ORGANIZATION_ROLES.includes(role as OrganizationRole)

/** The provider's organization that carries a Heka organization id. */
export interface DirectoryOrganization {
  /** The provider's own id (Keycloak organization id, Auth0 `org_…`). */
  id: string
  name: string
  /** The Heka organization id (`heka_org_id`): names the organization's wallet. */
  hekaOrgId: string
}

export interface DirectoryMember {
  /** The provider's user id; the path parameter of the API. */
  id: string
  /** The Heka user id: what heka-identity-service derives wallets from. */
  hekaUid: string
  username: string
  /** The Heka roles the member's token will carry for this organization (provider noise filtered out). */
  roles: Role[]
}

/**
 * The OIDC provider's view of organizations, members and their Heka roles. Implementations call the provider's
 * admin API with a dedicated service account; the rules about who may change what live in the service.
 */
export interface OrganizationDirectory {
  findOrganization(hekaOrgId: string): Promise<DirectoryOrganization | undefined>
  listMembers(organization: DirectoryOrganization): Promise<DirectoryMember[]>
  /** The member, or `undefined` when the user is not a member of this organization. */
  getMember(organization: DirectoryOrganization, memberId: string): Promise<DirectoryMember | undefined>
  /** Replaces the member's Heka role in this organization with `role`, leaving exactly that one. */
  setRole(organization: DirectoryOrganization, member: DirectoryMember, role: OrganizationRole): Promise<void>
}

export const ORGANIZATION_DIRECTORY = Symbol('ORGANIZATION_DIRECTORY')

/** The provider answered with an error or was unreachable. */
export class DirectoryError extends Error {}
