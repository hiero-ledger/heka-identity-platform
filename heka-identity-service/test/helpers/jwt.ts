import { SignJWT } from 'jose'

import { Role } from 'common/auth'
import {
  getTrustedKeyPair,
  getUntrustedKeyPair,
  testOidcAudience,
  testOidcIssuer,
  testSigningKeyId,
} from 'test/config/oidc'

export interface SignOptions {
  subject?: string
  issuer?: string
  audience?: string | string[]
  /** Seconds, a Date, or a duration such as `1w` / `1s`. */
  expiresIn?: number | string | Date
}

export interface SignJwtOptions {
  /** Sign with a key that is not in the service's JWKS. */
  untrusted?: boolean
}

function withStandardClaims(jwt: SignJWT, options: SignOptions): SignJWT {
  jwt.setIssuedAt()
  if (options.subject !== undefined) jwt.setSubject(options.subject)
  if (options.issuer !== undefined) jwt.setIssuer(options.issuer)
  if (options.audience !== undefined) jwt.setAudience(options.audience)
  if (options.expiresIn !== undefined) jwt.setExpirationTime(options.expiresIn)
  return jwt
}

/** Signs an RS256 token with the test provider's key (published in the test JWKS). */
export async function signJwt(
  payload: Record<string, unknown>,
  options: SignOptions,
  { untrusted = false }: SignJwtOptions = {},
): Promise<string> {
  const { privateKey } = await (untrusted ? getUntrustedKeyPair() : getTrustedKeyPair())
  const jwt = withStandardClaims(new SignJWT(payload), options)
  return jwt.setProtectedHeader({ alg: 'RS256', kid: testSigningKeyId }).sign(privateKey)
}

/** Signs an HS256 token with a shared secret; the service must reject it. */
export async function signHs256Jwt(
  payload: Record<string, unknown>,
  options: SignOptions,
  secret = 'test',
): Promise<string> {
  const jwt = withStandardClaims(new SignJWT(payload), options)
  return jwt.setProtectedHeader({ alg: 'HS256' }).sign(new TextEncoder().encode(secret))
}

export async function createAuthToken(userId: string, role: Role, orgId?: string): Promise<string> {
  const payload: Record<string, unknown> = {
    name: userId,
    type: 'access',
    roles: [role as string],
  }

  if (orgId !== undefined) {
    payload.org_id = orgId
  }

  return await signJwt(payload, {
    subject: userId,
    issuer: testOidcIssuer,
    audience: testOidcAudience,
    expiresIn: '1w',
  })
}
