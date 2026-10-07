import { exportJWK, generateKeyPair, JSONWebKeySet } from 'jose'

import { OidcConfig, oidcClaimsDefaults, oidcConfigDefaults } from 'src/config/oidc'

export const testOidcIssuer = 'https://oidc.test.heka.local/realms/heka'
export const testOidcAudience = 'heka-identity-service'
export const testSigningKeyId = 'heka-test-key'

type KeyPair = Awaited<ReturnType<typeof generateKeyPair>>

let trustedKeyPair: Promise<KeyPair> | undefined
let untrustedKeyPair: Promise<KeyPair> | undefined

/** The key pair whose public half is published in the test JWKS. */
export const getTrustedKeyPair = (): Promise<KeyPair> =>
  (trustedKeyPair ??= generateKeyPair('RS256', { extractable: true }))

/** A key pair the service does not know about, for invalid-signature tests. */
export const getUntrustedKeyPair = (): Promise<KeyPair> =>
  (untrustedKeyPair ??= generateKeyPair('RS256', { extractable: true }))

export async function getTestJwks(): Promise<JSONWebKeySet> {
  const { publicKey } = await getTrustedKeyPair()
  const jwk = await exportJWK(publicKey)
  return { keys: [{ ...jwk, kid: testSigningKeyId, alg: 'RS256', use: 'sig' }] }
}

// Inline JWKS: no discovery, no network. The claim paths are the defaults so that
// tokens shaped like Keycloak tokens (`roles`, `name`, `org_id` at the top level) are accepted unchanged.
export default async (): Promise<OidcConfig> => ({
  issuerUrl: testOidcIssuer,
  audience: testOidcAudience,
  jwks: await getTestJwks(),
  algorithms: [...oidcConfigDefaults.algorithms],
  // Strict: the "expired token" e2e cases sign a 1s token and wait 2s, which a tolerance would absorb.
  clockTolerance: 0,
  claims: { ...oidcClaimsDefaults, name: [...oidcClaimsDefaults.name] },
})
