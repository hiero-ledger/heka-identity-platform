import { createHash, generateKeyPairSync } from 'node:crypto'

const thumbprint = (jwk: Record<string, any>) => {
  const members =
    jwk.kty === 'RSA' ? { e: jwk.e, kty: jwk.kty, n: jwk.n } : { crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y }
  return createHash('sha256').update(JSON.stringify(members)).digest('base64url')
}

/** Fresh RS256 + ES256 signing JWKS for provider tests (kid = RFC 7638 thumbprint). */
export const testJwks = (): { keys: Record<string, any>[] } => {
  const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ format: 'jwk' }) as Record<
    string,
    any
  >
  const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ format: 'jwk' }) as Record<
    string,
    any
  >
  return {
    keys: [
      { ...rsa, kid: thumbprint(rsa), alg: 'RS256', use: 'sig' },
      { ...ec, kid: thumbprint(ec), alg: 'ES256', use: 'sig' },
    ],
  }
}
