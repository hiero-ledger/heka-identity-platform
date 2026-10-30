import type { AgentContext } from '@credo-ts/core'
import {
  KeyManagementError,
  type KeyManagementService,
  type KmsCreateKeyOptions,
  type KmsCreateKeyReturn,
  type KmsCreateKeyType,
  type KmsDecryptOptions,
  type KmsDecryptReturn,
  type KmsDeleteKeyOptions,
  type KmsEncryptOptions,
  type KmsEncryptReturn,
  type KmsImportKeyOptions,
  type KmsImportKeyReturn,
  type KmsJwkPrivate,
  type KmsJwkPublic,
  type KmsOperation,
  type KmsRandomBytesOptions,
  type KmsRandomBytesReturn,
  type KmsSignOptions,
  type KmsSignReturn,
  type KmsVerifyOptions,
  type KmsVerifyReturn,
} from '@credo-ts/core/kms'

interface StoredKey {
  keyId: string
  publicJwk: KmsJwkPublic & { kid: string }
  privateKey: CryptoKey
  publicKey?: CryptoKey
}

const GCM_ALGORITHMS = new Set(['A128GCM', 'A192GCM', 'A256GCM'])

/**
 * Browser KMS. Private keys are created non-extractable and stay in IndexedDB.
 * Import of private key material is rejected so a key cannot be copied out.
 */
export class WebCryptoKeyManagementService implements KeyManagementService {
  public readonly backend = 'webcrypto-browser'

  private readonly dbPromise: Promise<IDBDatabase>

  public constructor(dbName = 'heka-wallet-kms') {
    this.dbPromise = openKeyDatabase(dbName)
  }

  public isOperationSupported(_agentContext: AgentContext, operation: KmsOperation): boolean {
    switch (operation.operation) {
      case 'randomBytes':
      case 'deleteKey':
        return true
      case 'importKey':
        return false
      case 'createKey':
        return canCreate(operation.type)
      case 'sign':
      case 'verify':
        return operation.algorithm === 'EdDSA' || operation.algorithm === 'Ed25519' || operation.algorithm.startsWith('ES') || operation.algorithm.startsWith('HS')
      case 'encrypt':
        return GCM_ALGORITHMS.has(operation.encryption.algorithm) && !operation.keyAgreement
      case 'decrypt':
        return GCM_ALGORITHMS.has(operation.decryption.algorithm) && !operation.keyAgreement
      default:
        return false
    }
  }

  public async getPublicKey(_agentContext: AgentContext, keyId: string): Promise<KmsJwkPublic | null> {
    const stored = await this.readKey(keyId)
    return stored?.publicJwk ?? null
  }

  public async createKey<Type extends KmsCreateKeyType>(
    _agentContext: AgentContext,
    options: KmsCreateKeyOptions<Type>,
  ): Promise<KmsCreateKeyReturn<Type>> {
    if (!canCreate(options.type)) {
      throw new KeyManagementError(`Key type ${JSON.stringify(options.type)} is not supported by the browser KMS`)
    }

    const keyId = options.keyId ?? crypto.randomUUID()
    const created = await generateKey(options.type)
    const publicJwk = { ...(await exportPublicJwk(created.publicKey ?? created.privateKey, options.type)), kid: keyId }
    await this.writeKey({ keyId, publicJwk, privateKey: created.privateKey, publicKey: created.publicKey })
    return { keyId, publicJwk } as KmsCreateKeyReturn<Type>
  }

  public async importKey<Jwk extends KmsJwkPrivate>(
    _agentContext: AgentContext,
    _options: KmsImportKeyOptions<Jwk>,
  ): Promise<KmsImportKeyReturn<Jwk>> {
    throw new KeyManagementError('Private key import is disabled. Browser keys are created non-extractable.')
  }

  public async deleteKey(_agentContext: AgentContext, options: KmsDeleteKeyOptions): Promise<boolean> {
    const existing = await this.readKey(options.keyId)
    if (!existing) return false
    const db = await this.dbPromise
    await requestToPromise(db.transaction('keys', 'readwrite').objectStore('keys').delete(options.keyId))
    return true
  }

  public async sign(_agentContext: AgentContext, options: KmsSignOptions): Promise<KmsSignReturn> {
    const stored = await this.requireKey(options.keyId)
    const signature = await crypto.subtle.sign(webCryptoAlgorithm(options.algorithm), stored.privateKey, asBuffer(options.data))
    return { signature: new Uint8Array(signature) }
  }

  public async verify(_agentContext: AgentContext, options: KmsVerifyOptions): Promise<KmsVerifyReturn> {
    if ('keyId' in options.key && options.key.keyId) {
      const stored = await this.requireKey(options.key.keyId)
      const verified = await crypto.subtle.verify(
        webCryptoAlgorithm(options.algorithm),
        stored.publicKey ?? stored.privateKey,
        asBuffer(options.signature),
        asBuffer(options.data),
      )
      return verified ? { verified: true, publicJwk: stored.publicJwk } : { verified: false }
    }

    if (!('publicJwk' in options.key) || !options.key.publicJwk) {
      throw new KeyManagementError('A verification key is required')
    }

    const publicJwk = options.key.publicJwk
    const key = await crypto.subtle.importKey('jwk', publicJwk as JsonWebKey, algorithmForJwk(publicJwk), false, ['verify'])
    const verified = await crypto.subtle.verify(
      webCryptoAlgorithm(options.algorithm),
      key,
      asBuffer(options.signature),
      asBuffer(options.data),
    )
    return verified ? { verified: true, publicJwk } : { verified: false }
  }

  public async encrypt(_agentContext: AgentContext, options: KmsEncryptOptions): Promise<KmsEncryptReturn> {
    if (!('keyId' in options.key) || !GCM_ALGORITHMS.has(options.encryption.algorithm)) {
      throw new KeyManagementError('Only AES-GCM encryption with a stored key id is supported')
    }
    const stored = await this.requireKey(requireKeyId(options.key.keyId))
    const iv = options.encryption.iv ?? crypto.getRandomValues(new Uint8Array(12))
    const aad = 'aad' in options.encryption ? options.encryption.aad : undefined
    const encryptedWithTag = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: asBuffer(iv), additionalData: aad ? asBuffer(aad) : undefined, tagLength: 128 },
        stored.privateKey,
        asBuffer(options.data),
      ),
    )
    const tagLength = 16
    return {
      encrypted: encryptedWithTag.slice(0, encryptedWithTag.length - tagLength),
      tag: encryptedWithTag.slice(encryptedWithTag.length - tagLength),
      iv,
    }
  }

  public async decrypt(_agentContext: AgentContext, options: KmsDecryptOptions): Promise<KmsDecryptReturn> {
    if (!('keyId' in options.key) || !GCM_ALGORITHMS.has(options.decryption.algorithm) || !('tag' in options.decryption)) {
      throw new KeyManagementError('Only AES-GCM decryption with a stored key id is supported')
    }
    const stored = await this.requireKey(requireKeyId(options.key.keyId))
    const combined = concatBytes(options.encrypted, options.decryption.tag)
    const aad = 'aad' in options.decryption ? options.decryption.aad : undefined
    const data = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: asBuffer(options.decryption.iv), additionalData: aad ? asBuffer(aad) : undefined, tagLength: 128 },
      stored.privateKey,
      asBuffer(combined),
    )
    return { data: new Uint8Array(data) }
  }

  public randomBytes(_agentContext: AgentContext, options: KmsRandomBytesOptions): KmsRandomBytesReturn {
    return crypto.getRandomValues(new Uint8Array(options.length))
  }

  private async requireKey(keyId: string): Promise<StoredKey> {
    const stored = await this.readKey(keyId)
    if (!stored) throw new KeyManagementError(`Key ${keyId} was not found`)
    return stored
  }

  private async readKey(keyId: string): Promise<StoredKey | undefined> {
    const db = await this.dbPromise
    return requestToPromise(db.transaction('keys', 'readonly').objectStore('keys').get(keyId))
  }

  private async writeKey(stored: StoredKey): Promise<void> {
    const db = await this.dbPromise
    await requestToPromise(db.transaction('keys', 'readwrite').objectStore('keys').put(stored))
  }
}

function requireKeyId(keyId: string | undefined): string {
  if (!keyId) throw new KeyManagementError('A key id is required')
  return keyId
}

function canCreate(type: KmsCreateKeyType): boolean {
  if (type.kty === 'OKP') return type.crv === 'Ed25519' || type.crv === 'X25519'
  if (type.kty === 'EC') return type.crv === 'P-256' || type.crv === 'P-384'
  if (type.kty === 'oct') return type.algorithm === 'aes' || type.algorithm === 'hmac'
  return false
}

async function generateKey(type: KmsCreateKeyType): Promise<{ privateKey: CryptoKey; publicKey?: CryptoKey }> {
  if (type.kty === 'OKP' && type.crv === 'Ed25519') {
    const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify'])) as CryptoKeyPair
    return { privateKey: pair.privateKey, publicKey: pair.publicKey }
  }
  if (type.kty === 'OKP' && type.crv === 'X25519') {
    const pair = (await crypto.subtle.generateKey({ name: 'X25519' }, false, ['deriveBits'])) as CryptoKeyPair
    return { privateKey: pair.privateKey, publicKey: pair.publicKey }
  }
  if (type.kty === 'EC') {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: type.crv }, false, ['sign', 'verify'])) as CryptoKeyPair
    return { privateKey: pair.privateKey, publicKey: pair.publicKey }
  }
  if (type.kty === 'oct' && type.algorithm === 'aes') {
    const length = type.length === 128 || type.length === 192 || type.length === 256 ? type.length : 256
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length }, false, ['encrypt', 'decrypt'])
    return { privateKey: key }
  }
  if (type.kty === 'oct' && type.algorithm === 'hmac') {
    const hash = type.length === 384 ? 'SHA-384' : type.length === 512 ? 'SHA-512' : 'SHA-256'
    const key = await crypto.subtle.generateKey({ name: 'HMAC', hash, length: type.length }, false, ['sign', 'verify'])
    return { privateKey: key }
  }
  throw new KeyManagementError(`Cannot create key type ${JSON.stringify(type)}`)
}

async function exportPublicJwk(key: CryptoKey, type: KmsCreateKeyType): Promise<KmsJwkPublic> {
  if (type.kty === 'oct') {
    return { kty: 'oct' }
  }
  const jwk = await crypto.subtle.exportKey('jwk', key)
  const { d: _private, ...publicJwk } = jwk
  return publicJwk as KmsJwkPublic
}

function webCryptoAlgorithm(algorithm: string): AlgorithmIdentifier | EcdsaParams {
  if (algorithm === 'EdDSA' || algorithm === 'Ed25519') return { name: 'Ed25519' }
  if (algorithm === 'ES256') return { name: 'ECDSA', hash: 'SHA-256' }
  if (algorithm === 'ES384') return { name: 'ECDSA', hash: 'SHA-384' }
  if (algorithm === 'ES512') return { name: 'ECDSA', hash: 'SHA-512' }
  if (algorithm === 'HS256') return { name: 'HMAC', hash: 'SHA-256' }
  if (algorithm === 'HS384') return { name: 'HMAC', hash: 'SHA-384' }
  if (algorithm === 'HS512') return { name: 'HMAC', hash: 'SHA-512' }
  throw new KeyManagementError(`Signature algorithm ${algorithm} is not supported by the browser KMS`)
}

function algorithmForJwk(jwk: KmsJwkPublic): AlgorithmIdentifier | EcKeyImportParams | HmacImportParams {
  if (jwk.kty === 'OKP' && jwk.crv === 'Ed25519') return { name: 'Ed25519' }
  if (jwk.kty === 'EC') return { name: 'ECDSA', namedCurve: jwk.crv }
  if (jwk.kty === 'oct') return { name: 'HMAC', hash: 'SHA-256' }
  throw new KeyManagementError(`Cannot import a public JWK of type ${jwk.kty}`)
}

function asBuffer(bytes: Uint8Array): BufferSource {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

function concatBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  const combined = new Uint8Array(left.length + right.length)
  combined.set(left, 0)
  combined.set(right, left.length)
  return combined
}

function openKeyDatabase(dbName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('keys')) {
        db.createObjectStore('keys', { keyPath: 'keyId' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Failed to open the key database'))
  })
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}
