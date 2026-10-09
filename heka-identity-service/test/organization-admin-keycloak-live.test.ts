import { randomUUID } from 'crypto'

import { Role } from 'common/auth'
import { DirectoryOrganization } from 'organization-admin/directory/directory.types'
import { KeycloakDirectory } from 'organization-admin/directory/keycloak.directory'

/**
 * `KeycloakDirectory` against a real Keycloak running the shipped `heka-platform` realm: finds an organization by
 * its `heka_org_id`, lists members with their effective Heka roles, and changes a role through the admin API with a
 * service account that holds only the documented `realm-management` roles.
 *
 * Opt-in: set `KEYCLOAK_LIVE_URL` (e.g. `http://localhost:8080`); master-realm admin credentials come from
 * `KEYCLOAK_ADMIN_USERNAME` / `KEYCLOAK_ADMIN_PASSWORD` (default `admin` / `admin`, as in the dev compose file).
 * The test creates its own client, organization and users, and deletes them afterwards.
 */
const keycloakUrl = process.env.KEYCLOAK_LIVE_URL?.replace(/\/+$/, '')
const realm = process.env.KEYCLOAK_LIVE_REALM ?? 'heka-platform'
const adminRealm = `${keycloakUrl}/admin/realms/${realm}`
const suffix = randomUUID().slice(0, 8)
const clientId = `org-admin-live-${suffix}`
const clientSecret = `live-test-secret-${randomUUID()}`
const hekaOrgId = `live-org-${suffix}`
const SERVICE_ACCOUNT_ROLES = ['manage-users', 'view-users', 'view-clients', 'query-groups', 'manage-realm']

let adminToken = ''
const admin = async <T = unknown>(method: string, path: string, body?: unknown): Promise<T> => {
  const response = await fetch(`${adminRealm}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${adminToken}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`)
  const text = await response.text()
  return (text ? JSON.parse(text) : undefined) as T
}
const idOf = async (path: string) => ((await admin<{ id: string }[]>('GET', path))[0] as { id: string }).id

describe.skipIf(!keycloakUrl)('Keycloak live: KeycloakDirectory for delegated organization administration', () => {
  let directory: KeycloakDirectory
  let organization: DirectoryOrganization
  const users: Record<string, string> = {}
  let clientUuid = ''
  let orgUuid = ''

  beforeAll(async () => {
    const tokenResponse = await fetch(`${keycloakUrl}/realms/master/protocol/openid-connect/token`, {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'password',
        client_id: 'admin-cli',
        username: process.env.KEYCLOAK_ADMIN_USERNAME ?? 'admin',
        password: process.env.KEYCLOAK_ADMIN_PASSWORD ?? 'admin',
      }),
    })
    adminToken = ((await tokenResponse.json()) as { access_token: string }).access_token

    // Service account with the documented roles only
    await admin('POST', '/clients', {
      clientId,
      secret: clientSecret,
      publicClient: false,
      serviceAccountsEnabled: true,
      standardFlowEnabled: false,
    })
    clientUuid = await idOf(`/clients?clientId=${clientId}`)
    const serviceAccount = await admin<{ id: string }>('GET', `/clients/${clientUuid}/service-account-user`)
    const realmManagement = await idOf('/clients?clientId=realm-management')
    const roles = await admin<{ id: string; name: string }[]>('GET', `/clients/${realmManagement}/roles`)
    await admin(
      'POST',
      `/users/${serviceAccount.id}/role-mappings/clients/${realmManagement}`,
      roles.filter((role) => SERVICE_ACCOUNT_ROLES.includes(role.name)),
    )

    // Organization with heka_org_id, and three members: an OrgAdmin, a new sign-up (User via heka-users), an operator
    await admin('POST', '/organizations', {
      name: hekaOrgId,
      alias: hekaOrgId,
      attributes: { heka_org_id: [hekaOrgId] },
      domains: [{ name: `${hekaOrgId}.invalid` }],
    })
    orgUuid = await idOf(`/organizations?search=${hekaOrgId}&exact=true`)
    const hekaClient = await idOf('/clients?clientId=heka-identity-service')
    const hekaRole = (name: string) =>
      admin<{ id: string; name: string }>('GET', `/clients/${hekaClient}/roles/${name}`)
    for (const name of ['boss', 'newbie', 'operator']) {
      await admin('POST', '/users', { username: `${name}-${suffix}`, enabled: true, groups: ['/heka-users'] })
      users[name] = await idOf(`/users?username=${name}-${suffix}&exact=true`)
      await admin('POST', `/organizations/${orgUuid}/members`, users[name])
    }
    const usersGroup = await idOf('/groups?search=heka-users&exact=true')
    await admin('DELETE', `/users/${users.boss}/groups/${usersGroup}`)
    await admin('POST', `/users/${users.boss}/role-mappings/clients/${hekaClient}`, [await hekaRole('OrgAdmin')])
    await admin('DELETE', `/users/${users.operator}/groups/${usersGroup}`)
    await admin('PUT', `/users/${users.operator}/groups/${await idOf('/groups?search=heka-admins&exact=true')}`)

    directory = new KeycloakDirectory({
      url: keycloakUrl as string,
      realm,
      clientId,
      clientSecret,
      rolesClientId: 'heka-identity-service',
      defaultGroup: '/heka-users',
      orgIdField: 'heka_org_id',
    })
  }, 60_000)

  afterAll(async () => {
    for (const id of Object.values(users)) await admin('DELETE', `/users/${id}`).catch(() => undefined)
    if (orgUuid) await admin('DELETE', `/organizations/${orgUuid}`).catch(() => undefined)
    if (clientUuid) await admin('DELETE', `/clients/${clientUuid}`).catch(() => undefined)
  })

  test('finds the organization by heka_org_id, and only by an exact match', async () => {
    organization = (await directory.findOrganization(hekaOrgId)) as DirectoryOrganization

    expect(organization).toEqual({ id: orgUuid, name: hekaOrgId, hekaOrgId })
    expect(await directory.findOrganization(`${hekaOrgId}-other`)).toBeUndefined()
  })

  test('lists the members with their effective Heka roles, group roles included', async () => {
    const members = await directory.listMembers(organization)
    const roleOf = (id: string) => members.find((member) => member.id === id)?.roles

    expect(members).toHaveLength(3)
    expect(roleOf(users.boss)).toEqual([Role.OrgAdmin])
    expect(roleOf(users.newbie)).toEqual([Role.User])
    expect(roleOf(users.operator)).toEqual([Role.Admin])
    expect(members.find((member) => member.id === users.boss)?.hekaUid).toBe(users.boss)
  })

  test('gives a User member an organization role: leaves heka-users and holds exactly that role', async () => {
    const newbie = (await directory.getMember(organization, users.newbie))!

    await directory.setRole(organization, newbie, Role.Issuer)

    expect((await directory.getMember(organization, users.newbie))?.roles).toEqual([Role.Issuer])
    const groups = await admin<{ path: string }[]>('GET', `/users/${users.newbie}/groups`)
    expect(groups.map((group) => group.path)).not.toContain('/heka-users')
  })

  test('replaces an organization role with another', async () => {
    const newbie = (await directory.getMember(organization, users.newbie))!

    await directory.setRole(organization, newbie, Role.OrgMember)

    expect((await directory.getMember(organization, users.newbie))?.roles).toEqual([Role.OrgMember])
  })

  test('does not find a user of the realm who is not a member', async () => {
    expect(await directory.getMember(organization, randomUUID())).toBeUndefined()
  })
})
