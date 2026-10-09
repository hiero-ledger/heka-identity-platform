import { UnauthorizedException } from '@nestjs/common'

import { OidcClaimsConfig } from 'config/oidc'

import { isRole, Role } from './auth-info.interface'
import { TokenPayload } from './token-payload.interface'

export type Claims = Record<string, unknown>

const MAX_USER_ID_LENGTH = 255

/**
 * Resolves a claim path against a token payload.
 *
 * Resolution order:
 * 1. a literal top-level key, so URL-style claim names (`https://heka.example/roles`) work without escaping;
 * 2. a JSON pointer (RFC 6901) when the path starts with `/`, e.g. `/realm_access/roles`;
 * 3. a dotted path, e.g. `realm_access.roles`.
 */
export function getClaim(payload: Claims, path: string): unknown {
  if (Object.prototype.hasOwnProperty.call(payload, path)) {
    return payload[path]
  }

  const segments = path.startsWith('/')
    ? path
        .slice(1)
        .split('/')
        .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'))
    : path.split('.')

  let current: unknown = payload
  for (const segment of segments) {
    if (current === null || typeof current !== 'object') {
      return undefined
    }
    current = (current as Claims)[segment]
  }
  return current
}

/**
 * Maps a verified token payload onto the identity service's claim contract.
 * Throws `UnauthorizedException` when the contract is not met.
 */
export function mapClaims(payload: Claims, config: OidcClaimsConfig): TokenPayload {
  const userId = getClaim(payload, config.userId)
  if (typeof userId !== 'string' || userId.length === 0 || userId.length > MAX_USER_ID_LENGTH) {
    throw new UnauthorizedException(`Token claim '${config.userId}' must be a non-empty string`)
  }

  const roles = extractRoles(getClaim(payload, config.roles), config.roles)

  const name = config.name
    .map((path) => getClaim(payload, path))
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0)

  // `Admin` and `User` act outside any organization (the `Administration` and `User_<id>` wallets), so an
  // organization in their token is ignored rather than rejected: a provider puts one there for a member who has no
  // organization role yet, e.g. a new sign-up added to a Keycloak or Auth0 organization.
  const orgId =
    roles[0] === Role.Admin || roles[0] === Role.User
      ? undefined
      : extractOrgId(payload, config.orgId, config.orgIdField)

  return {
    sub: userId,
    roles,
    name: name ?? userId,
    ...(orgId ? { org_id: orgId } : {}),
  }
}

/**
 * Exactly one Heka role. The claim may be a string, an array, or an object keyed by role name (Zitadel's
 * `urn:zitadel:iam:org:project:roles`); values that are not Heka roles (provider defaults, other apps) are ignored.
 */
function extractRoles(value: unknown, path: string): Role[] {
  const candidates: unknown[] = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? [value]
      : isPlainObject(value)
        ? Object.keys(value)
        : []
  const roles = candidates.filter((candidate): candidate is Role => typeof candidate === 'string' && isRole(candidate))

  if (roles.length === 0) {
    throw new UnauthorizedException(`Token claim '${path}' contains no Heka role`)
  }
  if (roles.length > 1) {
    throw new UnauthorizedException(
      `Token claim '${path}' contains ${roles.length} Heka roles (${roles.join(', ')}); exactly one is required`,
    )
  }

  return roles
}

const isPlainObject = (value: unknown): value is Claims =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isAbsent = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  value === '' ||
  (Array.isArray(value) && value.length === 0) ||
  (isPlainObject(value) && Object.keys(value).length === 0)

/**
 * The organization id from the first present path. Accepted shapes, so that a provider's organization claim can be
 * used directly:
 * - a string: `"acme"`;
 * - a single-element array: `["acme"]` (Keycloak's organization claim for one requested organization);
 * - an object with exactly one key, the organization: `{ "acme": { ... } }` (Keycloak with organization attributes).
 *   With `field` set, the id is read from that field of the value (`{ "acme": { "heka_org_id": ["org-1"] } }`),
 *   or of the object itself (`{ "heka_org_id": "org-1" }`); without it, the key is the id.
 * More than one organization is rejected: the login must select one.
 */
function extractOrgId(payload: Claims, paths: string[], field: string | undefined): string | undefined {
  for (const path of paths) {
    const value = getClaim(payload, path)
    if (!isAbsent(value)) {
      return resolveOrgId(value, path, field, false)
    }
  }
  return undefined
}

function resolveOrgId(value: unknown, path: string, field: string | undefined, insideOrganization: boolean): string {
  if (typeof value === 'string') {
    return value
  }
  if (Array.isArray(value)) {
    if (value.length > 1) {
      throw new UnauthorizedException(
        `Token claim '${path}' lists ${value.length} organizations; sign in to exactly one organization`,
      )
    }
    return resolveOrgId(value[0], path, field, insideOrganization)
  }
  if (isPlainObject(value)) {
    if (field && field in value) {
      return resolveOrgId(value[field], path, undefined, true)
    }
    const keys = Object.keys(value)
    if (insideOrganization || keys.length === 0) {
      throw new UnauthorizedException(`Token claim '${path}' has no organization id field '${field}'`)
    }
    if (keys.length > 1) {
      throw new UnauthorizedException(
        `Token claim '${path}' lists ${keys.length} organizations; sign in to exactly one organization`,
      )
    }
    return field ? resolveOrgId(value[keys[0]], path, field, true) : keys[0]
  }
  throw new UnauthorizedException(`Token claim '${path}' must be an organization id`)
}
