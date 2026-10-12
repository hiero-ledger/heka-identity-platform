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

export interface KeycloakDirectoryOptions {
  /** Keycloak base URL, e.g. `http://localhost:8080`. */
  url: string
  realm: string
  clientId: string
  clientSecret: string
  /** Client that owns the Heka client roles (`heka-identity-service`). */
  rolesClientId: string
  /** Default group that grants `User` (`/heka-users`). */
  defaultGroup: string
  /** Organization attribute that holds the Heka org id (`heka_org_id`). */
  orgIdField: string
}

interface KeycloakOrganization {
  id: string
  name: string
  alias?: string
  attributes?: Record<string, string[]>
}

interface KeycloakUser {
  id: string
  username: string
  attributes?: Record<string, string[]>
}

interface KeycloakRole {
  id: string
  name: string
}

const PAGE_SIZE = 100

/**
 * Keycloak Organizations through the admin REST API.
 *
 * The service account needs the `realm-management` roles `manage-users` and `view-users` (role mappings, group
 * membership), `view-clients` and `query-groups`, and `manage-realm`: Keycloak 26.0 only lets `manage-realm` read
 * organizations and their members.
 */
export class KeycloakDirectory implements OrganizationDirectory {
  private readonly api: AdminApiClient
  private rolesClientUuid?: string

  public constructor(private readonly options: KeycloakDirectoryOptions) {
    const realmUrl = `${options.url}/realms/${encodeURIComponent(options.realm)}`
    this.api = new AdminApiClient({
      tokenUrl: `${realmUrl}/protocol/openid-connect/token`,
      clientId: options.clientId,
      clientSecret: options.clientSecret,
      baseUrl: `${options.url}/admin/realms/${encodeURIComponent(options.realm)}`,
    })
  }

  public async findOrganization(hekaOrgId: string): Promise<DirectoryOrganization | undefined> {
    const field = this.options.orgIdField
    const found =
      (await this.api.request<KeycloakOrganization[]>(
        'GET',
        `/organizations?q=${encodeURIComponent(`${field}:${hekaOrgId}`)}`,
      )) ?? []
    // The search result omits attributes (Keycloak 26.0) and `q` may match loosely: confirm each candidate's exact
    // attribute value on the full representation
    for (const candidate of found) {
      const organization = await this.api.request<KeycloakOrganization>('GET', `/organizations/${candidate.id}`)
      if (organization?.attributes?.[field]?.includes(hekaOrgId)) {
        return { id: organization.id, name: organization.alias ?? organization.name, hekaOrgId }
      }
    }
    return undefined
  }

  public async listMembers(organization: DirectoryOrganization): Promise<DirectoryMember[]> {
    const users: KeycloakUser[] = []
    for (let first = 0; ; first += PAGE_SIZE) {
      const page =
        (await this.api.request<KeycloakUser[]>(
          'GET',
          `/organizations/${organization.id}/members?first=${first}&max=${PAGE_SIZE}`,
        )) ?? []
      users.push(...page)
      if (page.length < PAGE_SIZE) break
    }
    return await Promise.all(users.map((user) => this.toMember(user)))
  }

  public async getMember(organization: DirectoryOrganization, memberId: string): Promise<DirectoryMember | undefined> {
    const organizations =
      (await this.api.request<KeycloakOrganization[]>(
        'GET',
        `/organizations/members/${encodeURIComponent(memberId)}/organizations`,
      )) ?? []
    if (!organizations.some((candidate) => candidate.id === organization.id)) return undefined
    const user = await this.api.request<KeycloakUser>('GET', `/users/${encodeURIComponent(memberId)}`)
    return user ? await this.toMember(user) : undefined
  }

  public async setRole(organization: DirectoryOrganization, member: DirectoryMember, role: OrganizationRole) {
    const clientUuid = await this.getRolesClientUuid()
    const userPath = `/users/${encodeURIComponent(member.id)}`

    // 1. Remove the organization roles mapped directly to the user
    const direct =
      (await this.api.request<KeycloakRole[]>('GET', `${userPath}/role-mappings/clients/${clientUuid}`)) ?? []
    const toRemove = direct.filter((mapped) => isOrganizationRole(mapped.name) && mapped.name !== role)
    if (toRemove.length > 0) {
      await this.api.request('DELETE', `${userPath}/role-mappings/clients/${clientUuid}`, toRemove)
    }

    // 2. Leave the default group, which grants `User`: a second Heka role would be rejected
    const group = await this.api.request<{ id: string }>(
      'GET',
      `/group-by-path/${this.options.defaultGroup.split('/').filter(Boolean).map(encodeURIComponent).join('/')}`,
    )
    if (group) {
      await this.api.request('DELETE', `${userPath}/groups/${group.id}`)
    }

    // 3. Map the new role
    if (!direct.some((mapped) => mapped.name === role)) {
      const roleRepresentation = await this.api.request<KeycloakRole>(
        'GET',
        `/clients/${clientUuid}/roles/${encodeURIComponent(role)}`,
      )
      if (!roleRepresentation)
        throw new DirectoryError(`client role '${role}' of '${this.options.rolesClientId}' not found`)
      await this.api.request('POST', `${userPath}/role-mappings/clients/${clientUuid}`, [roleRepresentation])
    }

    // 4. Exactly the new role must remain (another source, e.g. a group, would still add a second one)
    const effective = await this.hekaRoles(member.id)
    if (effective.length !== 1 || effective[0] !== role) {
      throw new DirectoryError(
        `user ${member.id} still has the Heka roles ${effective.join(', ')} after the change; check their groups`,
      )
    }
  }

  private async toMember(user: KeycloakUser): Promise<DirectoryMember> {
    return {
      id: user.id,
      // The recipe's heka_uid mapper emits the user id; migrated users carry the same value as an attribute
      hekaUid: user.attributes?.heka_uid?.[0] ?? user.id,
      username: user.username,
      roles: await this.hekaRoles(user.id),
    }
  }

  /** Effective (direct and group) client roles of the roles client that are Heka roles. */
  private async hekaRoles(userId: string): Promise<Role[]> {
    const clientUuid = await this.getRolesClientUuid()
    const effective =
      (await this.api.request<KeycloakRole[]>(
        'GET',
        `/users/${encodeURIComponent(userId)}/role-mappings/clients/${clientUuid}/composite`,
      )) ?? []
    return effective.map((role) => role.name).filter((name): name is Role => isRole(name))
  }

  private async getRolesClientUuid(): Promise<string> {
    if (!this.rolesClientUuid) {
      const clients =
        (await this.api.request<{ id: string }[]>(
          'GET',
          `/clients?clientId=${encodeURIComponent(this.options.rolesClientId)}`,
        )) ?? []
      if (!clients[0]) throw new DirectoryError(`client '${this.options.rolesClientId}' not found`)
      this.rolesClientUuid = clients[0].id
    }
    return this.rolesClientUuid
  }
}
