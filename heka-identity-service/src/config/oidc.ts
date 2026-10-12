import type { JSONWebKeySet } from 'jose'

import { registerAs } from '@nestjs/config'

/**
 * Where the identity service finds its four contract claims in a verified token.
 *
 * Each entry is a claim path. Resolution order (see `getClaim` in `common/auth/claims.ts`):
 * a literal top-level key (so URL-style names such as `https://heka.example/roles` work as-is),
 * a JSON pointer when the path starts with `/` (RFC 6901, e.g. `/realm_access/roles`),
 * otherwise a dotted path (`realm_access.roles`).
 */
export interface OidcClaimsConfig {
  /** Stable user id. Defaults to `sub`. Pointing it at a custom claim (e.g. `heka_uid`) keeps tenants across providers. */
  userId: string
  /**
   * Heka role: a string, an array, or an object keyed by role name (Zitadel); exactly one known role must be
   * present after filtering.
   */
  roles: string
  /** Ordered fallback list for the display name. The user id is the last resort. */
  name: string[]
  /**
   * Ordered fallback list for the optional organization id; the first path that is present wins. Lets a provider's
   * organization claim (Keycloak Organizations) take precedence over a plain user attribute (`org_id`).
   */
  orgId: string[]
  /**
   * Field holding the Heka organization id inside an organization object, e.g. `heka_org_id` for Keycloak's
   * `{ "<alias>": { "heka_org_id": ["<id>"] } }`. Without it, a single-key object yields its key (the alias).
   */
  orgIdField?: string
}

export interface OidcConfig {
  /** Exact `iss` value; discovery is fetched from `<issuerUrl>/.well-known/openid-configuration`. */
  issuerUrl?: string
  /** JWKS endpoint override; when unset it is taken from discovery. */
  jwksUri?: string
  /** Inline JWKS override (dev/test); when set neither discovery nor `jwksUri` is used. */
  jwks?: JSONWebKeySet
  /** Accepted `aud` value; an array `aud` is accepted when it contains this value. */
  audience?: string
  /** Allowed JWS algorithms. HMAC algorithms are refused by the verifier. */
  algorithms: string[]
  /** Accepted clock skew in seconds. */
  clockTolerance: number
  claims: OidcClaimsConfig
}

export const oidcClaimsDefaults: OidcClaimsConfig = {
  userId: 'sub',
  roles: 'roles',
  name: ['name', 'preferred_username', 'nickname'],
  orgId: ['org_id'],
}

export const oidcConfigDefaults = {
  algorithms: ['RS256'],
  clockTolerance: 15,
}

const text = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

const list = (value: string | undefined, defaults: string[]): string[] => {
  const items = value
    ?.split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
  return items && items.length > 0 ? items : defaults
}

export default registerAs('oidc', (): OidcConfig => ({
  issuerUrl: text(process.env.OIDC_ISSUER_URL),
  jwksUri: text(process.env.OIDC_JWKS_URI),
  jwks: text(process.env.OIDC_JWKS) ? (JSON.parse(process.env.OIDC_JWKS as string) as JSONWebKeySet) : undefined,
  audience: text(process.env.OIDC_AUDIENCE),
  algorithms: list(process.env.OIDC_ALGORITHMS, oidcConfigDefaults.algorithms),
  clockTolerance: process.env.OIDC_CLOCK_TOLERANCE
    ? parseInt(process.env.OIDC_CLOCK_TOLERANCE, 10)
    : oidcConfigDefaults.clockTolerance,
  claims: {
    userId: text(process.env.OIDC_CLAIM_USER_ID) ?? oidcClaimsDefaults.userId,
    roles: text(process.env.OIDC_CLAIM_ROLES) ?? oidcClaimsDefaults.roles,
    name: list(process.env.OIDC_CLAIM_NAME, oidcClaimsDefaults.name),
    orgId: list(process.env.OIDC_CLAIM_ORG_ID, oidcClaimsDefaults.orgId),
    orgIdField: text(process.env.OIDC_CLAIM_ORG_ID_FIELD),
  },
}))
