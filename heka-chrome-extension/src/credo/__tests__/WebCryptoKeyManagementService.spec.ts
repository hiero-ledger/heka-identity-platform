import type { AgentContext } from '@credo-ts/core'
import { KeyManagementError } from '@credo-ts/core/kms'
import { beforeEach, describe, expect, it } from 'vitest'

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
