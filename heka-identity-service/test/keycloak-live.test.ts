import { createMock } from '@golevelup/ts-vitest'
import { UnauthorizedException } from '@nestjs/common'

import { TokenVerifier } from 'common/auth'
import { Logger } from 'common/logger'
import { OidcConfig, oidcClaimsDefaults, oidcConfigDefaults } from 'config/oidc'

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

/** The `heka-demo` service-account user has a fixed id in the realm file. */
const DEMO_ACCOUNT_ID = 'e5f6a7b8-c9d0-4e1f-a2b3-c4d5e6f7a8b9'

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

    expect(payload.roles).toEqual(['Admin'])
    expect(payload.sub).toMatch(/^[0-9a-f-]{36}$/)
    expect(payload.name).toBe('service-account-heka-sso-service')
    expect(payload.org_id).toBeUndefined()
  })

  test('maps the heka-demo service account to its fixed Heka user id', async () => {
    const token = await clientCredentialsToken(clients.demo)

    const payload = await buildVerifier().verify(token)

    expect(payload.sub).toBe(DEMO_ACCOUNT_ID)
    expect(payload.roles).toEqual(['Admin'])
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
