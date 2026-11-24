import { Metadata, SdJwtVcRecord, type AgentContext } from '@credo-ts/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { WebCryptoKeyManagementService } from '../../credo/WebCryptoKeyManagementService'
import { OPENID4VC_CREDENTIAL_METADATA_KEY } from '../credential-display'
import { acceptCredentialOffer, CredentialReceiveError } from '../receive'

const requestToken = vi.fn()
const requestCredentials = vi.fn()
const store = vi.fn()
const deleteById = vi.fn()
const createDid = vi.fn()
const deleteDidRecord = vi.fn()
const deleted: string[] = []
const dbName = 'heka-wallet-kms-cleanup'
const context = {} as AgentContext
let kms: WebCryptoKeyManagementService

vi.mock('../../credo/lazy-agent', () => ({
  getOrCreateAgent: async () => ({
    context,
    kms: {
      createKeyForSignatureAlgorithm: () => kms.createKey(context, { type: { kty: 'EC', crv: 'P-256' } }),
      deleteKey: async (options: { keyId: string }) => {
        deleted.push(options.keyId)
        return kms.deleteKey(context, options)
      },
    },
    dids: {
      create: createDid,
      getCreatedDids: async ({ did }: { did: string }) => [{ id: `record-of-${did}` }],
    },
    dependencyManager: { resolve: () => ({ delete: deleteDidRecord }) },
    openid4vc: { holder: { requestToken, requestCredentials } },
    sdJwtVc: { store, deleteById, getAll: async () => [] },
  }),
}))

const offer = {
  metadata: {
    credentialIssuer: {
      credential_issuer: 'https://issuer.example',
      display: [{ name: 'Example Issuer' }],
    },
  },
} as never

const jwkBinding = { supportsJwk: true, proofTypes: { jwt: { supportedSignatureAlgorithms: ['ES256'] } } }

type Resolver = (binding: unknown) => Promise<unknown>

function fakeRecord(id: string): SdJwtVcRecord {
  return Object.assign(Object.create(SdJwtVcRecord.prototype) as SdJwtVcRecord, { id, metadata: new Metadata({}) })
}

describe('acceptCredentialOffer', () => {
  beforeEach(() => {
    kms = new WebCryptoKeyManagementService(dbName)
    deleted.length = 0
    for (const mock of [requestToken, requestCredentials, store, deleteById, createDid, deleteDidRecord])
      mock.mockReset()
    deleteById.mockResolvedValue(undefined)
    requestToken.mockResolvedValue({ accessToken: 'token', cNonce: 'nonce' })
    vi.stubGlobal('chrome', { storage: { local: { set: vi.fn().mockResolvedValue(undefined) } } })
  })

  it('deletes the holder key when the credential request fails', async () => {
    requestCredentials.mockImplementation(async (options: { credentialBindingResolver: Resolver }) => {
      await options.credentialBindingResolver(jwkBinding)
      throw new Error('issuer down')
    })

    await expect(acceptCredentialOffer(offer)).rejects.toThrow(/issuer down/)
    expect(deleted).toHaveLength(1)
    expect(await kms.getPublicKey(context, deleted[0])).toBeNull()
    expect(store).not.toHaveBeenCalled()
    expect(deleteById).not.toHaveBeenCalled()
  })

  it('deletes stored records and every holder key when a later credential fails', async () => {
    requestCredentials.mockImplementation(async (options: { credentialBindingResolver: Resolver }) => {
      await options.credentialBindingResolver(jwkBinding)
      await options.credentialBindingResolver(jwkBinding)
      return {
        credentials: [{ record: fakeRecord('rec-1') }, { record: fakeRecord('rec-2') }],
        deferredCredentials: [],
      }
    })
    store.mockImplementation(async ({ record }: { record: { id: string } }) => {
      if (record.id === 'rec-2') throw new Error('store failed')
    })

    await expect(acceptCredentialOffer(offer)).rejects.toThrow(/store failed/)
    expect(deleteById).toHaveBeenCalledTimes(1)
    expect(deleteById).toHaveBeenCalledWith('rec-1')
    expect(deleted).toHaveLength(2)
    expect(await kms.getPublicKey(context, deleted[0])).toBeNull()
    expect(await kms.getPublicKey(context, deleted[1])).toBeNull()
  })

  it('deletes the DID record of a did-bound holder key when the attempt fails', async () => {
    createDid.mockResolvedValue({
      didState: { state: 'finished', did: 'did:jwk:eyJrdHkiOiJFQyIsImNydiI6IlAtMjU2IiwieCI6IngiLCJ5IjoieSJ9' },
    })
    requestCredentials.mockImplementation(async (options: { credentialBindingResolver: Resolver }) => {
      await options.credentialBindingResolver({ ...jwkBinding, supportsJwk: false, supportedDidMethods: ['did:jwk'] })
      throw new Error('issuer down')
    })

    await expect(acceptCredentialOffer(offer)).rejects.toThrow(/issuer down/)
    expect(deleteDidRecord).toHaveBeenCalledWith(context, {
      id: 'record-of-did:jwk:eyJrdHkiOiJFQyIsImNydiI6IlAtMjU2IiwieCI6IngiLCJ5IjoieSJ9',
    })
    expect(deleted).toHaveLength(1)
  })

  it('keeps an offer retryable while its code is not redeemed, and not after', async () => {
    requestToken.mockRejectedValueOnce(new Error('fetch failed'))
    const beforeToken = await acceptCredentialOffer(offer).catch((error: unknown) => error)
    expect(beforeToken).toBeInstanceOf(CredentialReceiveError)
    expect((beforeToken as CredentialReceiveError).retryable).toBe(true)

    requestCredentials.mockRejectedValueOnce(new Error('credential endpoint failed'))
    const afterToken = await acceptCredentialOffer(offer).catch((error: unknown) => error)
    expect((afterToken as CredentialReceiveError).retryable).toBe(false)
    expect((afterToken as CredentialReceiveError).message).toBe('credential endpoint failed')
  })

  it('stores the display metadata of the credential configuration on each record', async () => {
    const record = fakeRecord('rec-1')
    requestCredentials.mockResolvedValue({
      credentials: [
        {
          record,
          credentialConfiguration: {
            vct: 'https://issuer.example/vct/Membership',
            credential_metadata: { display: [{ name: 'Membership', background_color: '#12107c' }] },
          },
        },
      ],
      deferredCredentials: [],
    })

    await expect(acceptCredentialOffer(offer)).resolves.toEqual({ received: 1, deferred: 0 })
    expect(store).toHaveBeenCalledWith({ record })
    expect(record.metadata.get(OPENID4VC_CREDENTIAL_METADATA_KEY)).toEqual({
      credential: { name: 'Membership', backgroundColor: '#12107c' },
      issuer: { id: 'https://issuer.example', name: 'Example Issuer' },
    })
  })

  it('reports a deferred credential instead of counting it as received', async () => {
    requestCredentials.mockResolvedValue({ credentials: [], deferredCredentials: [{ transactionId: 'later' }] })

    await expect(acceptCredentialOffer(offer)).resolves.toEqual({ received: 0, deferred: 1 })
  })
})
