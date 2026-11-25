import { Kms, type AgentContext } from '@credo-ts/core'
import { KeyManagementError } from '@credo-ts/core/kms'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getOrCreateAgent } from '../lazy-agent'
import { WebCryptoKeyManagementService } from '../WebCryptoKeyManagementService'

const context = {} as AgentContext

describe('WebCryptoKeyManagementService', () => {
  let kms: WebCryptoKeyManagementService

  beforeEach(() => {
    kms = new WebCryptoKeyManagementService(`heka-wallet-kms-${crypto.randomUUID()}`)
  })

  it('creates a non-extractable P-256 key and a public JWK', async () => {
    const dbName = `heka-wallet-kms-${crypto.randomUUID()}`
    kms = new WebCryptoKeyManagementService(dbName)
    const created = await kms.createKey(context, { type: { kty: 'EC', crv: 'P-256' } })
    expect(created.publicJwk.kty).toBe('EC')
    if (created.publicJwk.kty !== 'EC') return
    expect(created.publicJwk.crv).toBe('P-256')
    expect(created.publicJwk).not.toHaveProperty('d')

    const stored = await readPrivateKey(dbName, created.keyId)
    expect(stored.extractable).toBe(false)
    expect(stored.algorithm).toMatchObject({ name: 'ECDSA' })
  })

  it('returns public JWKs without the WebCrypto export members, so the issuer does not get them', async () => {
    const ec = await kms.createKey(context, { type: { kty: 'EC', crv: 'P-256' } })
    const okp = await kms.createKey(context, { type: { kty: 'OKP', crv: 'Ed25519' } })

    // kid is the KMS key id, as Askar returns it; Credo leaves it out of the proof JWK.
    expect(Object.keys(ec.publicJwk).sort()).toEqual(['crv', 'kid', 'kty', 'x', 'y'])
    expect(Object.keys(okp.publicJwk).sort()).toEqual(['crv', 'kid', 'kty', 'x'])
    expect(Object.keys(Kms.PublicJwk.fromPublicJwk(ec.publicJwk).toJson({ includeKid: false })).sort()).toEqual([
      'crv',
      'kty',
      'x',
      'y',
    ])
    expect(await kms.getPublicKey(context, ec.keyId)).toEqual(ec.publicJwk)
  })

  it('drops an `alg` that the runtime adds to exported keys (Node 22.23 does for Ed25519)', async () => {
    const exportKey = crypto.subtle.exportKey.bind(crypto.subtle)
    const spy = vi.spyOn(crypto.subtle, 'exportKey').mockImplementation(async (format, key) => {
      const jwk = (await exportKey(format as 'jwk', key)) as JsonWebKey
      return { ...jwk, alg: 'Ed25519' }
    })
    try {
      const okp = await kms.createKey(context, { type: { kty: 'OKP', crv: 'Ed25519' } })
      expect(Object.keys(okp.publicJwk).sort()).toEqual(['crv', 'kid', 'kty', 'x'])
    } finally {
      spy.mockRestore()
    }
  })

  it('signs only with the algorithms of the keys it creates', () => {
    const supports = (algorithm: string) =>
      kms.isOperationSupported(context, { operation: 'sign', algorithm } as Parameters<
        WebCryptoKeyManagementService['isOperationSupported']
      >[1])

    for (const algorithm of ['ES256', 'ES384', 'EdDSA', 'Ed25519', 'HS256', 'HS384', 'HS512']) {
      expect(supports(algorithm), algorithm).toBe(true)
    }
    for (const algorithm of ['ES256K', 'ES512', 'RS256', 'PS256']) {
      expect(supports(algorithm), algorithm).toBe(false)
    }
  })

  it("verifies an ES512 (P-521) signature through Credo's KeyManagementApi", async () => {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-521' }, true, [
      'sign',
      'verify',
    ])) as CryptoKeyPair
    const data = new TextEncoder().encode('signed by an issuer')
    const signature = new Uint8Array(
      await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-512' }, pair.privateKey, data),
    )
    const { kty, crv, x, y } = await crypto.subtle.exportKey('jwk', pair.publicKey)
    const agent = await getOrCreateAgent()

    const result = await agent.kms.verify({
      key: { publicJwk: { kty, crv, x, y } as Kms.KmsJwkPublicEc },
      algorithm: 'ES512',
      data,
      signature,
    })

    expect(result.verified).toBe(true)
  })

  it('creates no X25519 keys, which no operation here could use', async () => {
    const type = { kty: 'OKP', crv: 'X25519' } as const
    expect(kms.isOperationSupported(context, { operation: 'createKey', type })).toBe(false)
    await expect(kms.createKey(context, { type })).rejects.toBeInstanceOf(KeyManagementError)
  })

  it('leaves the key for an encrypted OpenID4VP response to the key-agreement backend', () => {
    const supportsCreate = (type: object) =>
      kms.isOperationSupported(context, { operation: 'createKey', type } as Parameters<
        WebCryptoKeyManagementService['isOperationSupported']
      >[1])
    const verifierJwk = { kty: 'EC', crv: 'P-256', x: 'x', y: 'y', kid: 'enc', use: 'enc', alg: 'ECDH-ES' }

    expect(supportsCreate({ kty: 'EC', crv: 'P-256' })).toBe(true)
    expect(supportsCreate(verifierJwk)).toBe(false)
    expect(supportsCreate({ kty: 'EC', crv: 'P-256', use: 'enc' })).toBe(false)
    expect(
      kms.isOperationSupported(context, {
        operation: 'encrypt',
        encryption: { algorithm: 'A128GCM' },
        keyAgreement: { algorithm: 'ECDH-ES', externalPublicJwk: verifierJwk },
      } as never),
    ).toBe(false)
  })

  it('rejects private key import', async () => {
    await expect(
      kms.importKey(context, {
        privateJwk: { kty: 'EC', crv: 'P-256', d: 'secret', x: 'x', y: 'y' },
      }),
    ).rejects.toBeInstanceOf(KeyManagementError)
  })

  it('signs and verifies with the stored key', async () => {
    const created = await kms.createKey(context, { type: { kty: 'EC', crv: 'P-256' } })
    const data = new TextEncoder().encode('heka')
    const { signature } = await kms.sign(context, { keyId: created.keyId, algorithm: 'ES256', data })
    const verified = await kms.verify(context, {
      key: { keyId: created.keyId },
      algorithm: 'ES256',
      data,
      signature,
    })
    expect(verified.verified).toBe(true)
  })
})

async function readPrivateKey(dbName: string, keyId: string): Promise<CryptoKey> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(dbName)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  const stored = await new Promise<{ privateKey: CryptoKey }>((resolve, reject) => {
    const request = db.transaction('keys').objectStore('keys').get(keyId)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return stored.privateKey
}
