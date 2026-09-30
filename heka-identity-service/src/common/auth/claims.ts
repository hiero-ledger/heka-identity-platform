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

  const orgId = getClaim(payload, config.orgId)
  if (orgId !== undefined && orgId !== null && typeof orgId !== 'string') {
    throw new UnauthorizedException(`Token claim '${config.orgId}' must be a string`)
  }

  return {
    sub: userId,
    roles,
    name: name ?? userId,
    ...(orgId ? { org_id: orgId } : {}),
  }
}

function extractRoles(value: unknown, path: string): Role[] {
  const candidates: unknown[] = Array.isArray(value) ? value : typeof value === 'string' ? [value] : []
  const roles = candidates.filter((candidate): candidate is Role => typeof candidate === 'string' && isRole(candidate))

  if (roles.length !== 1) {
    throw new UnauthorizedException(`Token claim '${path}' must contain exactly one Heka role`)
  }

  return roles
}
