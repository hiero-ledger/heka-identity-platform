import type { AgentContext } from '@credo-ts/core'
import { KeyManagementError, type KmsJwkPublicEcdh } from '@credo-ts/core/kms'
import { base64url, compactDecrypt, exportJWK, generateKeyPair, type CryptoKey as JoseKey } from 'jose'
import { beforeAll, describe, expect, it } from 'vitest'

import { WebCryptoKeyAgreementService } from '../WebCryptoKeyAgreementService'

const context = {} as AgentContext
const utf8 = (text: string) => new TextEncoder().encode(text)

interface Verifier {
  publicJwk: KmsJwkPublicEcdh
  privateKey: JoseKey
}

async function createVerifier(): Promise<Verifier> {
  const { publicKey, privateKey } = await generateKeyPair('ECDH-ES', { crv: 'P-256' })
  const publicJwk = { ...(await exportJWK(publicKey)), kid: 'verifier-enc', use: 'enc', alg: 'ECDH-ES' }
  return { publicJwk: publicJwk as KmsJwkPublicEcdh, privateKey }
}

/** What Credo 0.7.4's JARM callback does (openid4vc shared/callbacks.mjs getOid4vcEncryptJweCallback). */
async function encryptLikeCredo(
  kms: WebCryptoKeyAgreementService,
  verifier: Verifier,
  enc: string,
  plaintext: string,
  party?: { apu: string; apv: string },
) {
  const ephemeral = await kms.createKey(context, { type: { kty: 'EC', crv: 'P-256' } })
  const header = { kid: verifier.publicJwk.kid, ...party, enc, alg: 'ECDH-ES', epk: ephemeral.publicJwk }
  const encodedHeader = base64url.encode(JSON.stringify(header))
  const encrypted = await kms.encrypt(context, {
    key: {
      keyAgreement: {
        keyId: ephemeral.keyId,
        algorithm: 'ECDH-ES',
        apu: party ? base64url.decode(party.apu) : undefined,
        apv: party ? base64url.decode(party.apv) : undefined,
        externalPublicJwk: verifier.publicJwk,
      },
    },
    data: utf8(plaintext),
    encryption: { algorithm: enc, aad: utf8(encodedHeader) } as never,
  })
  const parts = [encodedHeader, '', encrypted.iv!, encrypted.encrypted, encrypted.tag!]
  return {
    keyId: ephemeral.keyId,
    jwe: parts.map((part) => (typeof part === 'string' ? part : base64url.encode(part))).join('.'),
  }
}

describe('WebCryptoKeyAgreementService', () => {
  let verifier: Verifier

  beforeAll(async () => {
    verifier = await createVerifier()
  })

  for (const enc of ['A128GCM', 'A256GCM', 'A128CBC-HS256']) {
    it(`encrypts with ECDH-ES and ${enc} so that the verifier can decrypt (checked with jose)`, async () => {
      const kms = new WebCryptoKeyAgreementService()
      const party = { apu: base64url.encode('wallet nonce'), apv: base64url.encode('verifier nonce') }

      for (const { jwe } of [
        await encryptLikeCredo(kms, verifier, enc, '{"vp_token":"plain"}'),
        await encryptLikeCredo(kms, verifier, enc, '{"vp_token":"with apu and apv"}', party),
      ]) {
        const { plaintext, protectedHeader } = await compactDecrypt(jwe, verifier.privateKey)
        expect(protectedHeader).toMatchObject({ alg: 'ECDH-ES', enc })
        expect(new TextDecoder().decode(plaintext)).toMatch(/^\{"vp_token":/)
      }
    })
  }

  it('produces a JWE that another key, or a changed tag, cannot open', async () => {
    const kms = new WebCryptoKeyAgreementService()
    const { jwe } = await encryptLikeCredo(kms, verifier, 'A128GCM', 'secret')
    const otherVerifier = await createVerifier()
    const parts = jwe.split('.')
    const tag = base64url.decode(parts[4])
    tag[0] ^= 1
    const tampered = [...parts.slice(0, 4), base64url.encode(tag)].join('.')

    await expect(compactDecrypt(jwe, otherVerifier.privateKey)).rejects.toThrow()
    await expect(compactDecrypt(tampered, verifier.privateKey)).rejects.toThrow()
  })

  it('uses each key once: it is gone after encrypt, also after a failed one', async () => {
    const kms = new WebCryptoKeyAgreementService()
    const { keyId } = await encryptLikeCredo(kms, verifier, 'A256GCM', 'once')
    expect(await kms.getPublicKey(context, keyId)).toBeNull()

    const ephemeral = await kms.createKey(context, { type: { kty: 'EC', crv: 'P-256' } })
    const encryptWith = (algorithm: string) =>
      kms.encrypt(context, {
        key: { keyAgreement: { keyId: ephemeral.keyId, algorithm: 'ECDH-ES', externalPublicJwk: verifier.publicJwk } },
        data: utf8('x'),
        encryption: { algorithm } as never,
      })
    await expect(encryptWith('A192GCM')).rejects.toBeInstanceOf(KeyManagementError)
    expect(await kms.getPublicKey(context, ephemeral.keyId)).toBeNull()
    await expect(encryptWith('A128GCM')).rejects.toThrow(/not found/)
  })

  it('creates non-extractable ECDH keys and returns only the public members', async () => {
    const kms = new WebCryptoKeyAgreementService()
    const created = await kms.createKey(context, { type: { kty: 'EC', crv: 'P-256' } })

    expect(Object.keys(created.publicJwk).sort()).toEqual(['crv', 'kid', 'kty', 'x', 'y'])
    await expect(kms.createKey(context, { type: { kty: 'OKP', crv: 'Ed25519' } })).rejects.toBeInstanceOf(
      KeyManagementError,
    )
  })

  it('claims only key agreement: no signing keys, no signing, no other curves', () => {
    const kms = new WebCryptoKeyAgreementService()
    const supports = (operation: object) =>
      kms.isOperationSupported(
        context,
        operation as Parameters<WebCryptoKeyAgreementService['isOperationSupported']>[1],
      )
    const encryptTo = (externalPublicJwk: object, algorithm = 'A128GCM') => ({
      operation: 'encrypt',
      encryption: { algorithm },
      keyAgreement: { algorithm: 'ECDH-ES', externalPublicJwk },
    })

    expect(supports({ operation: 'createKey', type: verifier.publicJwk })).toBe(true)
    expect(supports({ operation: 'createKey', type: { kty: 'EC', crv: 'P-256' } })).toBe(false)
    expect(supports(encryptTo(verifier.publicJwk))).toBe(true)
    expect(supports(encryptTo({ kty: 'OKP', crv: 'X25519', x: 'x' }))).toBe(false)
    expect(supports({ operation: 'encrypt', encryption: { algorithm: 'A128GCM' } })).toBe(false)
    expect(supports({ operation: 'sign', algorithm: 'ES256' })).toBe(false)
    expect(supports({ operation: 'decrypt', decryption: { algorithm: 'A128GCM' } })).toBe(false)
  })
})
