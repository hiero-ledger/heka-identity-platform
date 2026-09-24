import { openDB, type IDBPDatabase } from 'idb'

const DB_NAME = 'heka-wallet'
const DB_VERSION = 1
const STORE_KEYS = 'keys'
const HOLDER_KEY_ID = 'holder-key-v1'

export interface StoredKeyPair {
  id: string
  publicKey: CryptoKey
  privateKey: CryptoKey
}

async function openWalletDB(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_KEYS)) {
        db.createObjectStore(STORE_KEYS, { keyPath: 'id' })
      }
    },
  })
}

/**
 * Generates a fresh ECDSA P-256 key pair and persists it to IndexedDB.
 * Should only be called once (on extension install). Subsequent calls are
 * guarded by `getOrCreateKeyPair`.
 */
async function generateAndStoreKeyPair(): Promise<StoredKeyPair> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'ECDSA',
      namedCurve: 'P-256',
    },
    false,
    ['sign', 'verify'],
  )

  const record: StoredKeyPair = {
    id: HOLDER_KEY_ID,
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
  }

  const db = await openWalletDB()
  await db.put(STORE_KEYS, record)
  db.close()

  return record
}

/**
 * Returns the holder key pair, generating and persisting it on first call.
 * This is the primary entry point for all key operations.
 */
export async function getOrCreateKeyPair(): Promise<StoredKeyPair> {
  const db = await openWalletDB()
  const existing = await db.get(STORE_KEYS, HOLDER_KEY_ID) as StoredKeyPair | undefined
  db.close()

  if (existing) {
    return existing
  }

  return generateAndStoreKeyPair()
}

/**
 * Returns the stored key pair, or null if the wallet has not been initialised.
 * Use this for read-only operations where key generation is not desired.
 */
export async function getKeyPair(): Promise<StoredKeyPair | null> {
  const db = await openWalletDB()
  const record = await db.get(STORE_KEYS, HOLDER_KEY_ID) as StoredKeyPair | undefined
  db.close()
  return record ?? null
}

/**
 * Signs arbitrary bytes with the holder's private key using ECDSA-SHA-256.
 * Used for building OID4VP holder binding proofs.
 */
export async function sign(data: BufferSource): Promise<ArrayBuffer> {
  const keyPair = await getKeyPair()
  if (!keyPair) {
    throw new Error('Wallet not initialised: no holder key found')
  }

  return crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    keyPair.privateKey,
    data,
  )
}

/**
 * Exports the public key as a JWK object. The private key is never exported.
 */
export async function getPublicKeyJwk(): Promise<JsonWebKey> {
  const keyPair = await getKeyPair()
  if (!keyPair) {
    throw new Error('Wallet not initialised: no holder key found')
  }
  return crypto.subtle.exportKey('jwk', keyPair.publicKey)
}
