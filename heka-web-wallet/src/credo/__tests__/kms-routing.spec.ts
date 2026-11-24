import { Kms, type Agent } from '@credo-ts/core'
import { exportJWK, generateKeyPair } from 'jose'
import { beforeAll, describe, expect, it } from 'vitest'

import { getOrCreateAgent } from '../lazy-agent'

/**
 * Pins how Credo 0.7.4's KeyManagementApi routes between the wallet's two KMS backends:
 * `webcrypto-browser` (holder keys) and `webcrypto-browser-ecdh` (the single-use key of an
 * encrypted OpenID4VP response). What a Credo upgrade can change here:
 * - createKey: if the unparsed `type` no longer reaches isOperationSupported, the ephemeral key
 *   becomes an ECDSA key that cannot do ECDH;
 * - deleteKey: if Credo looks the key id up, only this test needs updating (`encrypt` already
 *   deletes the key);
 * - Credo 0.8 creates the ephemeral key inside `encrypt` (`keyAgreement.recipient`), so one
 *   backend that does ECDH-ES is enough.
 */
describe('Credo 0.7.4 KMS routing the two wallet backends rely on (recheck after a Credo upgrade)', () => {
  let agent: Agent
  let signing: Kms.KeyManagementService
  let keyAgreement: Kms.KeyManagementService
  let verifierJwk: Kms.KmsJwkPublicEcdh

  beforeAll(async () => {
    agent = await getOrCreateAgent()
    const { backends } = agent.dependencyManager.resolve(Kms.KeyManagementModuleConfig)
    signing = backends.find((backend) => backend.backend === 'webcrypto-browser')!
    keyAgreement = backends.find((backend) => backend.backend === 'webcrypto-browser-ecdh')!
    // What Credo's verifier puts in client_metadata.jwks (OpenId4VpVerifierService.getClientMetadata).
    const { publicKey } = await generateKeyPair('ECDH-ES', { crv: 'P-256' })
    verifierJwk = { ...(await exportJWK(publicKey)), kid: 'verifier-enc', use: 'enc', alg: 'ECDH-ES' } as never
  })

  it('creates the key for a verifier JWK (Credo JARM callback) in the key-agreement backend', async () => {
    const { keyId } = await agent.kms.createKey({ type: verifierJwk as never })

    expect(await keyAgreement.getPublicKey(agent.context, keyId)).not.toBeNull()
    expect(await signing.getPublicKey(agent.context, keyId)).toBeNull()
  })

  it('creates a key from { kty, crv } in the signing backend', async () => {
    const { keyId } = await agent.kms.createKey({ type: { kty: 'EC', crv: 'P-256' } })

    expect(await signing.getPublicKey(agent.context, keyId)).not.toBeNull()
    expect(await keyAgreement.getPublicKey(agent.context, keyId)).toBeNull()
  })

  it("offers ECDH-ES to the verifier's JWK for the content encryption Credo's holder can pick", () => {
    const backendsFor = (algorithm: string) =>
      agent.kms.supportedBackendsForOperation({
        operation: 'encrypt',
        encryption: { algorithm },
        keyAgreement: { algorithm: 'ECDH-ES', externalPublicJwk: verifierJwk },
      } as never)

    for (const algorithm of ['A128GCM', 'A256GCM', 'A128CBC-HS256']) {
      expect(backendsFor(algorithm), algorithm).toEqual(['webcrypto-browser-ecdh'])
    }
    expect(backendsFor('A192GCM')).toEqual([])
  })

  it('routes encrypt by key id, and the key is gone afterwards', async () => {
    const { keyId } = await agent.kms.createKey({ type: verifierJwk as never })

    const encrypted = await agent.kms.encrypt({
      key: { keyAgreement: { keyId, algorithm: 'ECDH-ES', externalPublicJwk: verifierJwk } },
      data: new TextEncoder().encode('vp_token'),
      encryption: { algorithm: 'A128GCM', aad: new TextEncoder().encode('header') },
    })

    expect(encrypted.tag).toHaveLength(16)
    expect(await keyAgreement.getPublicKey(agent.context, keyId)).toBeNull()
  })

  it("sends Credo's deleteKey to the default backend, which answers false without throwing", async () => {
    const { keyId } = await agent.kms.createKey({ type: verifierJwk as never })

    await expect(agent.kms.deleteKey({ keyId })).resolves.toBe(false)
    // Not routed here; only `encrypt` (or this backend's own deleteKey) removes the key.
    expect(await keyAgreement.getPublicKey(agent.context, keyId)).not.toBeNull()
    await expect(keyAgreement.deleteKey(agent.context, { keyId })).resolves.toBe(true)
  })
})
