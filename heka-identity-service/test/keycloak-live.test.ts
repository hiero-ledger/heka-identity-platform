import { randomUUID } from 'crypto'

import { createMock } from '@golevelup/ts-vitest'
import { UnauthorizedException } from '@nestjs/common'

import { TokenPayload, TokenVerifier } from 'common/auth'
import { isRole } from 'common/auth/auth-info.interface'
import { Logger } from 'common/logger'
import { OidcConfig, oidcClaimsDefaults, oidcConfigDefaults } from 'config/oidc'
import { ADMINISTRATION_WALLET_ID, getWalletId } from 'utils/auth'

/**
 * Bearer-token verification against a real Keycloak running the shipped `heka-platform` realm
 * (heka-sso-service/keycloak/realm-heka-platform.json): discovery, JWKS download, `iss` / `aud`
 * checks and the claim mapping, with tokens the realm's service-account clients actually issue.
 *
 * Opt-in: set `KEYCLOAK_LIVE_URL` (e.g. `http://localhost:8080`) to run it; the CI workflow boots
 * Keycloak with `--import-realm` for this. Skipped otherwise, so the regular suite needs no Keycloak.
 * Does not need PostgreSQL: only `TokenVerifier` is exercised, not the application.
 */
const keycloakUrl = process.env.KEYCLOAK_LIVE_URL?.replace(/\/+$/, '')
const realm = process.env.KEYCLOAK_LIVE_REALM ?? 'heka-platform'
const issuer = `${keycloakUrl}/realms/${realm}`
const tokenUrl = `${issuer}/protocol/openid-connect/token`

const clients = {
  sso: { id: 'heka-sso-service', secret: 'dev-only-heka-sso-service-secret-do-not-use-in-production' },
  demo: { id: 'heka-demo', secret: 'dev-only-heka-demo-secret-do-not-use-in-production' },
}

/** Keycloak's own administrator (master realm), used only to create and delete a test user. CI boots it as admin/admin. */
const keycloakAdmin = {
  username: process.env.KEYCLOAK_LIVE_ADMIN_USER ?? 'admin',
  password: process.env.KEYCLOAK_LIVE_ADMIN_PASSWORD ?? 'admin',
}

/** The `heka-demo` service-account user has a fixed id in the realm file. */
const DEMO_ACCOUNT_ID = 'e5f6a7b8-c9d0-4e1f-a2b3-c4d5e6f7a8b9'

/** The organization of the `heka-sso-service` service account in the realm file. */
const SSO_ORG_ID = 'heka-sso'

/** The wallet heka-identity-service derives from a verified token. */
function walletOf(payload: TokenPayload): string {
  const [role] = payload.roles
  if (!isRole(role)) {
    throw new Error(`not a Heka role: ${role}`)
  }
  return getWalletId({ role, userId: payload.sub, orgId: payload.org_id })
}

async function clientCredentialsToken(client: { id: string; secret: string }): Promise<string> {
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: client.id, client_secret: client.secret }),
  })
  const body = (await response.json()) as { access_token?: string; error?: string; error_description?: string }
  if (!response.ok || !body.access_token) {
    throw new Error(
      `token request for ${client.id} failed: ${response.status} ${body.error ?? ''} ${body.error_description ?? ''}`,
    )
  }
  return body.access_token
}

async function keycloakAdminToken(): Promise<string> {
  const response = await fetch(`${keycloakUrl}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', client_id: 'admin-cli', ...keycloakAdmin }),
  })
  const body = (await response.json()) as { access_token?: string; error?: string; error_description?: string }
  if (!response.ok || !body.access_token) {
    throw new Error(
      `Keycloak admin token request failed: ${response.status} ${body.error ?? ''} ${body.error_description ?? ''}`,
    )
  }
  return body.access_token
}

const buildVerifier = (overrides: Partial<OidcConfig> = {}): TokenVerifier =>
  new TokenVerifier(
    {
      issuerUrl: issuer,
      audience: 'heka-identity-service',
      algorithms: [...oidcConfigDefaults.algorithms],
      clockTolerance: oidcConfigDefaults.clockTolerance,
      // The Keycloak recipe: claim paths at their defaults, the user id taken from `heka_uid`.
      claims: { ...oidcClaimsDefaults, name: [...oidcClaimsDefaults.name], userId: 'heka_uid' },
      ...overrides,
    },
    createMock<Logger>(),
  )

describe.skipIf(!keycloakUrl)('Keycloak live: TokenVerifier against the heka-platform realm', () => {
  test('accepts a heka-sso-service service-account token through discovery and maps the contract claims', async () => {
    const token = await clientCredentialsToken(clients.sso)

    const payload = await buildVerifier().verify(token)

    expect(payload.sub).toMatch(/^[0-9a-f-]{36}$/)
    expect(payload.name).toBe('service-account-heka-sso-service')
  })

  test('makes heka-sso-service OrgAdmin of its own organization, not Admin', async () => {
    const token = await clientCredentialsToken(clients.sso)

    const payload = await buildVerifier().verify(token)

    // Exactly OrgAdmin: the realm's default group (User) must not add a second role to the service account
    expect(payload.roles).toEqual(['OrgAdmin'])
    expect(payload.org_id).toBe(SSO_ORG_ID)
    expect(walletOf(payload)).toBe(`Organization_${SSO_ORG_ID}`)
  })

  test('maps the heka-demo service account to its fixed Heka user id and the User role', async () => {
    const token = await clientCredentialsToken(clients.demo)

    const payload = await buildVerifier().verify(token)

    expect(payload.sub).toBe(DEMO_ACCOUNT_ID)
    // Its token is public (GET /demo/token), so it must never open the shared Administration wallet
    expect(payload.roles).toEqual(['User'])
    expect(payload.org_id).toBeUndefined()
    expect(walletOf(payload)).toBe(`User_${DEMO_ACCOUNT_ID}`)
  })

  test('no default service account acts in the shared Administration wallet', async () => {
    for (const client of [clients.sso, clients.demo]) {
      const payload = await buildVerifier().verify(await clientCredentialsToken(client))

      expect(walletOf(payload)).not.toBe(ADMINISTRATION_WALLET_ID)
    }
  })

  test('reads the user id from sub when OIDC_CLAIM_USER_ID is left at its default (same value in Keycloak)', async () => {
    const token = await clientCredentialsToken(clients.demo)

    const payload = await buildVerifier({
      claims: { ...oidcClaimsDefaults, name: [...oidcClaimsDefaults.name] },
    }).verify(token)

    expect(payload.sub).toBe(DEMO_ACCOUNT_ID)
  })

  test('rejects the token for another audience', async () => {
    const token = await clientCredentialsToken(clients.sso)

    await expect(buildVerifier({ audience: 'another-service' }).verify(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    )
  })

  test('rejects the token for another issuer', async () => {
    const token = await clientCredentialsToken(clients.sso)

    await expect(buildVerifier({ issuerUrl: `${keycloakUrl}/realms/master` }).verify(token)).rejects.toThrow()
  })

  test('rejects a tampered token', async () => {
    const token = await clientCredentialsToken(clients.sso)
    const [header, payload, signature] = token.split('.')
    const tampered = `${header}.${Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString()), roles: ['User'] })).toString('base64url')}.${signature}`

    await expect(buildVerifier().verify(tampered)).rejects.toBeInstanceOf(UnauthorizedException)
  })
})

/**
 * The user profile must keep `org_id` (it names the organization wallet) and `heka_uid` out of users' reach: with
 * either one writable through the account console, a member with an organization role could move into another
 * organization's wallet. The test creates its own user as the Keycloak administrator (master realm) and signs
 * in as that user with the realm's built-in `admin-cli` client (password grant), which reaches the account API.
 */
describe.skipIf(!keycloakUrl)('Keycloak live: users cannot edit the attributes heka-identity-service trusts', () => {
  const password = `Live-${randomUUID()}`
  const username = `attr-live-${randomUUID().slice(0, 8)}`
  let adminToken = ''
  let userToken = ''
  let userId = ''

  const admin = async (method: string, path: string, body?: unknown): Promise<Response> =>
    await fetch(`${keycloakUrl}/admin/realms/${realm}${path}`, {
      method,
      headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  const account = async (method: string, body?: unknown): Promise<Response> =>
    await fetch(`${issuer}/account`, {
      method,
      headers: { authorization: `Bearer ${userToken}`, 'content-type': 'application/json', accept: 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  const attributesOf = async (): Promise<Record<string, string[]>> =>
    ((await (await admin('GET', `/users/${userId}`)).json()) as { attributes?: Record<string, string[]> }).attributes ??
    {}

  beforeAll(async () => {
    adminToken = await keycloakAdminToken()
    const created = await admin('POST', '/users', {
      username,
      enabled: true,
      email: `${username}@example.invalid`,
      emailVerified: true,
      firstName: 'Attribute',
      lastName: 'Test',
      attributes: { org_id: ['admin-assigned-org'] },
      credentials: [{ type: 'password', value: password, temporary: false }],
    })
    expect(created.status).toBe(201)
    userId = created.headers.get('location')?.split('/').pop() ?? ''

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'password', client_id: 'admin-cli', username, password }),
    })
    userToken = ((await response.json()) as { access_token: string }).access_token
  })

  afterAll(async () => {
    if (userId) await admin('DELETE', `/users/${userId}`)
  })

  test.each([
    ['org_id', 'victim-org'],
    ['heka_uid', DEMO_ACCOUNT_ID],
  ])('rejects a user setting their own %s', async (attribute, value) => {
    const me = (await (await account('GET')).json()) as { attributes?: Record<string, string[]> }

    const response = await account('POST', { ...me, attributes: { ...me.attributes, [attribute]: [value] } })

    expect(response.status).toBe(400)
    expect(await response.text()).toContain('error-user-attribute-read-only')
    expect((await attributesOf())[attribute]).not.toEqual([value])
  })

  test('keeps the admin-assigned org_id when the user edits their profile', async () => {
    const me = (await (await account('GET')).json()) as Record<string, unknown>

    const response = await account('POST', { ...me, firstName: 'Renamed' })

    expect(response.status).toBe(204)
    expect((await attributesOf()).org_id).toEqual(['admin-assigned-org'])
  })
})
