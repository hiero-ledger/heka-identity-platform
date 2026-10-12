import { isRole, Role } from 'common/auth/auth-info.interface'

import { AdminApiClient } from './admin-api.client'
import {
  DirectoryError,
  DirectoryMember,
  DirectoryOrganization,
  isOrganizationRole,
  OrganizationDirectory,
  OrganizationRole,
} from './directory.types'

export interface Auth0DirectoryOptions {
  /** Tenant URL, e.g. `https://<tenant>.<region>.auth0.com`. */
  url: string
  clientId: string
  clientSecret: string
  /** Organization metadata field that holds the Heka org id (`heka_org_id`). */
  orgIdField: string
}

interface Auth0Organization {
  id: string
  name: string
  metadata?: Record<string, string>
}

interface Auth0Member {
  user_id: string
  name?: string
  email?: string
}

interface Auth0Role {
  id: string
  name: string
}

interface Auth0User {
  user_id: string
  username?: string
  name?: string
  email?: string
  app_metadata?: Record<string, unknown>
}

const PAGE_SIZE = 100

/**
 * Auth0 Organizations through the Management API. Heka roles are the roles of the organization membership, which is
 * what the post-login Action emits for a login through the organization.
 *
 * The machine-to-machine application needs these Management API scopes: `read:organizations`,
 * `read:organization_members`, `read:organization_member_roles`, `create:organization_member_roles`,
 * `delete:organization_member_roles`, `read:roles` and `read:users`.
 */
export class Auth0Directory implements OrganizationDirectory {
  private readonly api: AdminApiClient
  private roleIds?: Map<string, string>

  public constructor(private readonly options: Auth0DirectoryOptions) {
    this.api = new AdminApiClient({
      tokenUrl: `${options.url}/oauth/token`,
      clientId: options.clientId,
      clientSecret: options.clientSecret,
      tokenParams: { audience: `${options.url}/api/v2/` },
      baseUrl: `${options.url}/api/v2`,
    })
  }

  public async findOrganization(hekaOrgId: string): Promise<DirectoryOrganization | undefined> {
    const field = this.options.orgIdField
    for (let page = 0; ; page++) {
      const organizations =
        (await this.api.request<Auth0Organization[]>('GET', `/organizations?page=${page}&per_page=${PAGE_SIZE}`)) ?? []
      // Same rule as the post-login Action: metadata.heka_org_id, falling back to the Auth0 id
      const organization = organizations.find(
        (candidate) => (candidate.metadata?.[field] ?? candidate.id) === hekaOrgId,
      )
      if (organization) return { id: organization.id, name: organization.name, hekaOrgId }
      if (organizations.length < PAGE_SIZE) return undefined
    }
  }

  public async listMembers(organization: DirectoryOrganization): Promise<DirectoryMember[]> {
    const members: Auth0Member[] = []
    for (let page = 0; ; page++) {
      const batch =
        (await this.api.request<Auth0Member[]>(
          'GET',
          `/organizations/${organization.id}/members?page=${page}&per_page=${PAGE_SIZE}`,
        )) ?? []
      members.push(...batch)
      if (batch.length < PAGE_SIZE) break
    }
    // One member at a time: the Management API rate limit is low on small plans
    const result: DirectoryMember[] = []
    for (const member of members) {
      result.push(await this.toMember(organization, member.user_id))
    }
    return result
  }

  public async getMember(organization: DirectoryOrganization, memberId: string): Promise<DirectoryMember | undefined> {
    const organizations =
      (await this.api.request<Auth0Organization[]>('GET', `/users/${encodeURIComponent(memberId)}/organizations`)) ?? []
    if (!organizations.some((candidate) => candidate.id === organization.id)) return undefined
    return await this.toMember(organization, memberId)
  }

  public async setRole(organization: DirectoryOrganization, member: DirectoryMember, role: OrganizationRole) {
    const rolesPath = `/organizations/${organization.id}/members/${encodeURIComponent(member.id)}/roles`
    const current = (await this.api.request<Auth0Role[]>('GET', rolesPath)) ?? []

    // Remove every other Heka role of the membership: the post-login Action requires exactly one
    const toRemove = current.filter((assigned) => isRole(assigned.name) && assigned.name !== role)
    if (toRemove.length > 0) {
      await this.api.request('DELETE', rolesPath, { roles: toRemove.map((assigned) => assigned.id) })
    }
    if (!current.some((assigned) => assigned.name === role)) {
      await this.api.request('POST', rolesPath, { roles: [await this.roleId(role)] })
    }

    const effective = await this.membershipRoles(organization, member.id)
    if (effective.length !== 1 || effective[0] !== role) {
      throw new DirectoryError(`membership of ${member.id} has the Heka roles ${effective.join(', ')} after the change`)
    }
  }

  private async toMember(organization: DirectoryOrganization, userId: string): Promise<DirectoryMember> {
    const user = await this.api.request<Auth0User>(
      'GET',
      `/users/${encodeURIComponent(userId)}?fields=user_id,username,name,email,app_metadata&include_fields=true`,
    )
    const hekaUid = user?.app_metadata?.heka_uid
    return {
      id: userId,
      // Same rule as the post-login Action: app_metadata.heka_uid, falling back to the Auth0 user id
      hekaUid: typeof hekaUid === 'string' && hekaUid ? hekaUid : userId,
      username: user?.username ?? user?.name ?? user?.email ?? userId,
      roles: await this.membershipRoles(organization, userId),
    }
  }

  private async membershipRoles(organization: DirectoryOrganization, userId: string): Promise<Role[]> {
    const roles =
      (await this.api.request<Auth0Role[]>(
        'GET',
        `/organizations/${organization.id}/members/${encodeURIComponent(userId)}/roles`,
      )) ?? []
    return roles.map((role) => role.name).filter((name): name is Role => isRole(name))
  }

  private async roleId(role: OrganizationRole): Promise<string> {
    if (!this.roleIds) {
      const roles = (await this.api.request<Auth0Role[]>('GET', `/roles?per_page=${PAGE_SIZE}`)) ?? []
      this.roleIds = new Map(roles.filter((candidate) => isOrganizationRole(candidate.name)).map((r) => [r.name, r.id]))
    }
    const id = this.roleIds.get(role)
    if (!id) throw new DirectoryError(`Auth0 role '${role}' not found; run setup-tenant.sh`)
    return id
  }
}
