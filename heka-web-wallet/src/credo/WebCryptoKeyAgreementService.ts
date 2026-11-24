import type { AgentContext } from '@credo-ts/core'
import {
  KeyManagementError,
  type KeyManagementService,
  type KmsCreateKeyOptions,
  type KmsCreateKeyReturn,
  type KmsCreateKeyType,
  type KmsDecryptReturn,
  type KmsEncryptOptions,
  type KmsEncryptReturn,
  type KmsImportKeyReturn,
  type KmsJwkPublic,
  type KmsOperation,
  type KmsRandomBytesReturn,
  type KmsSignReturn,
  type KmsVerifyReturn,
} from '@credo-ts/core/kms'

import { asBuffer, concatBytes } from './bytes'

// The content encryption Credo 0.7.4's holder can pick for an OpenID4VP response, with the key
// length the Concat KDF derives for it. (Chrome has no 192-bit AES.)
const CONTENT_ENCRYPTION_KEY_BITS = new Map([
  ['A128GCM', 128],
  ['A256GCM', 256],
  ['A128CBC-HS256', 256],
])

interface EphemeralKey {
  publicJwk: KmsJwkPublic & { kid: string }
  privateKey: CryptoKey
}

/**
 * A create-key type that is a whole public JWK for key agreement. Credo 0.7.4 creates the
 * ephemeral key of an encrypted OpenID4VP response with `createKey({ type: <verifier's JWK> })`,
 * and passes that type unparsed to `isOperationSupported` when it picks the backend
 * (KeyManagementApi.createKey). A holder signing key is created from `{ kty, crv }` only.
 */
export function isKeyAgreementKeyType(type: KmsCreateKeyType): boolean {
  const jwk = type as Record<string, unknown>
  return 'x' in jwk || jwk.use === 'enc' || (typeof jwk.alg === 'string' && jwk.alg.startsWith('ECDH'))
}

function isP256Jwk(jwk: unknown): jwk is { kty: 'EC'; crv: 'P-256'; x: string; y: string } {
  const candidate = jwk as Record<string, unknown> | undefined
  return candidate?.kty === 'EC' && candidate.crv === 'P-256'
}

/**
 * The wallet's second KMS backend: single-use ECDH P-256 keys for the ECDH-ES encryption of an
 * OpenID4VP `direct_post.jwt` response. WebCrypto fixes a key's algorithm when it creates it, so
 * the signing backend's ECDSA keys cannot do key agreement; Credo routes these keys here through
 * `isOperationSupported` (isKeyAgreementKeyType).
 *
 * The keys live in memory only and are deleted when `encrypt` ends, successful or not, because
 * Credo 0.7.4's `deleteKey` goes to the default backend (docs/credo-in-the-browser.md).
 */
export class WebCryptoKeyAgreementService implements KeyManagementService {
  public readonly backend = 'webcrypto-browser-ecdh'

  private readonly keys = new Map<string, EphemeralKey>()

  public isOperationSupported(_agentContext: AgentContext, operation: KmsOperation): boolean {
    switch (operation.operation) {
      case 'createKey':
        return isKeyAgreementKeyType(operation.type) && isP256Jwk(operation.type)
      case 'encrypt':
        return (
          operation.keyAgreement?.algorithm === 'ECDH-ES' &&
          isP256Jwk((operation.keyAgreement as { externalPublicJwk?: unknown }).externalPublicJwk) &&
          CONTENT_ENCRYPTION_KEY_BITS.has(operation.encryption.algorithm)
        )
      case 'deleteKey':
        return true
      default:
        return false
    }
  }

  public async getPublicKey(_agentContext: AgentContext, keyId: string): Promise<KmsJwkPublic | null> {
    return this.keys.get(keyId)?.publicJwk ?? null
  }

  public async createKey<Type extends KmsCreateKeyType>(
    _agentContext: AgentContext,
    options: KmsCreateKeyOptions<Type>,
  ): Promise<KmsCreateKeyReturn<Type>> {
    if (!isP256Jwk(options.type)) {
      throw new KeyManagementError(`The key-agreement backend creates only EC P-256 keys`)
    }
    const keyId = options.keyId ?? crypto.randomUUID()
    const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, [
      'deriveBits',
    ])) as CryptoKeyPair
    const { x, y } = await crypto.subtle.exportKey('jwk', pair.publicKey)
    const publicJwk = { kty: 'EC' as const, crv: 'P-256' as const, x: x as string, y: y as string, kid: keyId }
    this.keys.set(keyId, { publicJwk, privateKey: pair.privateKey })
    return { keyId, publicJwk } as unknown as KmsCreateKeyReturn<Type>
  }

  public async deleteKey(_agentContext: AgentContext, options: { keyId: string }): Promise<boolean> {
    return this.keys.delete(options.keyId)
  }

  /**
   * ECDH-ES with direct key agreement (RFC 7518 §4.6): the Concat KDF turns the shared secret into
   * the content encryption key, and the caller's AAD is the JWE protected header.
   */
  public async encrypt(_agentContext: AgentContext, options: KmsEncryptOptions): Promise<KmsEncryptReturn> {
    const keyAgreement = 'keyAgreement' in options.key ? options.key.keyAgreement : undefined
    if (keyAgreement?.algorithm !== 'ECDH-ES' || !('keyId' in keyAgreement)) {
      throw new KeyManagementError('The key-agreement backend encrypts only with ECDH-ES and a key it created')
    }
    try {
      const ephemeral = this.keys.get(keyAgreement.keyId)
      if (!ephemeral) throw new KeyManagementError(`Key ${keyAgreement.keyId} was not found`)
      const { externalPublicJwk } = keyAgreement
      const enc = options.encryption.algorithm
      const keyBits = CONTENT_ENCRYPTION_KEY_BITS.get(enc)
      if (!isP256Jwk(externalPublicJwk) || keyBits === undefined) {
        throw new KeyManagementError(`ECDH-ES with ${enc} to this key is not supported by the key-agreement backend`)
      }

      // Only the key members: WebCrypto checks `use`, `alg` and `key_ops` against the import.
      const recipient = await crypto.subtle.importKey(
        'jwk',
        { kty: 'EC', crv: 'P-256', x: externalPublicJwk.x, y: externalPublicJwk.y },
        { name: 'ECDH', namedCurve: 'P-256' },
        false,
        [],
      )
      const sharedSecret = new Uint8Array(
        await crypto.subtle.deriveBits({ name: 'ECDH', public: recipient }, ephemeral.privateKey, 256),
      )
      const contentKey = await concatKdf(sharedSecret, keyBits, enc, keyAgreement.apu, keyAgreement.apv)
      const iv = 'iv' in options.encryption ? options.encryption.iv : undefined
      const aad = 'aad' in options.encryption ? options.encryption.aad : undefined
      return enc === 'A128CBC-HS256'
        ? await encryptAesCbcHmac(contentKey, options.data, aad, iv)
        : await encryptAesGcm(contentKey, options.data, aad, iv)
    } finally {
      this.keys.delete(keyAgreement.keyId)
    }
  }

  public async importKey(): Promise<KmsImportKeyReturn<never>> {
    throw new KeyManagementError('The key-agreement backend does not import keys')
  }

  public async sign(): Promise<KmsSignReturn> {
    throw new KeyManagementError('The key-agreement backend does not sign')
  }

  public async verify(): Promise<KmsVerifyReturn> {
    throw new KeyManagementError('The key-agreement backend does not verify')
  }

  public async decrypt(): Promise<KmsDecryptReturn> {
    throw new KeyManagementError('The key-agreement backend does not decrypt')
  }

  public randomBytes(): KmsRandomBytesReturn {
    throw new KeyManagementError('The key-agreement backend does not generate random bytes')
  }
}

function uint32(value: number): Uint8Array {
  const bytes = new Uint8Array(4)
  new DataView(bytes.buffer).setUint32(0, value)
  return bytes
}

function withLength(data: Uint8Array): Uint8Array {
  return concatBytes(uint32(data.length), data)
}

/**
 * Concat KDF (NIST SP 800-56A, as RFC 7518 §4.6.2 uses it) with SHA-256. For direct key agreement
 * AlgorithmID is the `enc` value, PartyUInfo and PartyVInfo are `apu` and `apv`, and SuppPubInfo
 * is the key length in bits.
 */
async function concatKdf(
  sharedSecret: Uint8Array,
  keyBits: number,
  enc: string,
  apu: Uint8Array | undefined,
  apv: Uint8Array | undefined,
): Promise<Uint8Array> {
  const otherInfo = concatBytes(
    withLength(new TextEncoder().encode(enc)),
    withLength(apu ?? new Uint8Array()),
    withLength(apv ?? new Uint8Array()),
    uint32(keyBits),
  )
  const rounds = Math.ceil(keyBits / 256)
  const output = new Uint8Array(rounds * 32)
  for (let round = 0; round < rounds; round++) {
    const digest = await crypto.subtle.digest(
      'SHA-256',
      asBuffer(concatBytes(uint32(round + 1), sharedSecret, otherInfo)),
    )
    output.set(new Uint8Array(digest), round * 32)
  }
  return output.slice(0, keyBits / 8)
}

async function encryptAesGcm(
  key: Uint8Array,
  data: Uint8Array,
  aad: Uint8Array | undefined,
  givenIv: Uint8Array | undefined,
): Promise<KmsEncryptReturn> {
  const iv = givenIv ?? crypto.getRandomValues(new Uint8Array(12))
  const cryptoKey = await crypto.subtle.importKey('raw', asBuffer(key), 'AES-GCM', false, ['encrypt'])
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: asBuffer(iv), additionalData: aad ? asBuffer(aad) : undefined, tagLength: 128 },
      cryptoKey,
      asBuffer(data),
    ),
  )
  return { encrypted: sealed.slice(0, sealed.length - 16), tag: sealed.slice(sealed.length - 16), iv }
}

/** AES_128_CBC_HMAC_SHA_256 (RFC 7518 §5.2.3): the first 16 key bytes are the MAC key. */
async function encryptAesCbcHmac(
  key: Uint8Array,
  data: Uint8Array,
  aad: Uint8Array | undefined,
  givenIv: Uint8Array | undefined,
): Promise<KmsEncryptReturn> {
  const iv = givenIv ?? crypto.getRandomValues(new Uint8Array(16))
  const encryptionKey = await crypto.subtle.importKey('raw', asBuffer(key.slice(16)), 'AES-CBC', false, ['encrypt'])
  const macKey = await crypto.subtle.importKey(
    'raw',
    asBuffer(key.slice(0, 16)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-CBC', iv: asBuffer(iv) }, encryptionKey, asBuffer(data)),
  )
  const additionalData = aad ?? new Uint8Array()
  const aadBits = new Uint8Array(8)
  new DataView(aadBits.buffer).setBigUint64(0, BigInt(additionalData.length * 8))
  const mac = new Uint8Array(
    await crypto.subtle.sign('HMAC', macKey, asBuffer(concatBytes(additionalData, iv, encrypted, aadBits))),
  )
  return { encrypted, tag: mac.slice(0, 16), iv }
}
