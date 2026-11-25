import { Metadata, SdJwtVcRecord, type AgentContext } from '@credo-ts/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { WebCryptoKeyManagementService } from '../../credo/WebCryptoKeyManagementService'
import { OPENID4VC_CREDENTIAL_METADATA_KEY } from '../credential-display'
import { acceptCredentialOffer, CredentialReceiveError, receiveResultMessage, UnsupportedOfferError } from '../receive'

const requestToken = vi.fn()
const requestCredentials = vi.fn()
const store = vi.fn()
const deleteById = vi.fn()
const createDid = vi.fn()
const deleteDidRecord = vi.fn()
const getAll = vi.fn()
const sendMessage = vi.fn()
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
    sdJwtVc: { store, deleteById, getAll },
  }),
}))

const offerUri = 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Foffers%2F1'
const membership = {
  format: 'dc+sd-jwt',
  vct: 'https://issuer.example/vct/Membership',
  cryptographic_binding_methods_supported: ['jwk'],
  proof_types_supported: { jwt: { proof_signing_alg_values_supported: ['ES256'] } },
}
const offerFor = (configuration: object) =>
  ({
    metadata: {
      originalDraftVersion: 'V1',
      credentialIssuer: {
        credential_issuer: 'https://issuer.example',
        display: [{ name: 'Example Issuer' }],
      },
    },
    offeredCredentialConfigurations: { Membership: configuration },
  }) as never
const offer = offerFor(membership)

const jwkBinding = { supportsJwk: true, proofTypes: { jwt: { supportedSignatureAlgorithms: ['ES256'] } } }

type Resolver = (binding: unknown) => Promise<unknown>

function fakeRecord(id: string): SdJwtVcRecord {
  const record = Object.assign(Object.create(SdJwtVcRecord.prototype) as SdJwtVcRecord, {
    id,
    metadata: new Metadata({}),
  })
  return Object.defineProperty(record, 'firstCredential', { value: { payload: { iss: 'did:key:z6Mkissuer' } } })
}

describe('acceptCredentialOffer', () => {
  beforeEach(() => {
    kms = new WebCryptoKeyManagementService(dbName)
    deleted.length = 0
    for (const mock of [requestToken, requestCredentials, store, deleteById, createDid, deleteDidRecord, getAll])
      mock.mockReset()
    deleteById.mockResolvedValue(undefined)
    getAll.mockResolvedValue([])
    requestToken.mockResolvedValue({ accessToken: 'token', cNonce: 'nonce' })
    sendMessage.mockReset().mockResolvedValue({ type: 'SETTLED', settled: true })
    vi.stubGlobal('chrome', {
      runtime: { sendMessage },
      storage: { local: { set: vi.fn().mockResolvedValue(undefined) } },
    })
  })

  it('deletes the holder key when the credential request fails', async () => {
    requestCredentials.mockImplementation(async (options: { credentialBindingResolver: Resolver }) => {
      await options.credentialBindingResolver(jwkBinding)
      throw new Error('issuer down')
    })

    await expect(acceptCredentialOffer(offerUri, offer)).rejects.toThrow(/issuer down/)
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

    await expect(acceptCredentialOffer(offerUri, offer)).rejects.toThrow(/store failed/)
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

    await expect(acceptCredentialOffer(offerUri, offer)).rejects.toThrow(/issuer down/)
    expect(deleteDidRecord).toHaveBeenCalledWith(context, {
      id: 'record-of-did:jwk:eyJrdHkiOiJFQyIsImNydiI6IlAtMjU2IiwieCI6IngiLCJ5IjoieSJ9',
    })
    expect(deleted).toHaveLength(1)
  })

  it('keeps an offer retryable while its code is not redeemed, and not after', async () => {
    requestToken.mockRejectedValueOnce(new Error('fetch failed'))
    const beforeToken = await acceptCredentialOffer(offerUri, offer).catch((error: unknown) => error)
    expect(beforeToken).toBeInstanceOf(CredentialReceiveError)
    expect((beforeToken as CredentialReceiveError).retryable).toBe(true)

    requestCredentials.mockRejectedValueOnce(new Error('credential endpoint failed'))
    const afterToken = await acceptCredentialOffer(offerUri, offer).catch((error: unknown) => error)
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

    await expect(acceptCredentialOffer(offerUri, offer)).resolves.toEqual({
      received: 1,
      deferred: 0,
      signedBy: ['did:key:z6Mkissuer'],
      summaryUpdated: true,
    })
    expect(store).toHaveBeenCalledWith({ record })
    expect(record.metadata.get(OPENID4VC_CREDENTIAL_METADATA_KEY)).toEqual({
      credential: { name: 'Membership', backgroundColor: '#12107c' },
      issuer: { id: 'https://issuer.example', name: 'Example Issuer' },
    })
  })

  it('reports a deferred credential instead of counting it as received', async () => {
    requestCredentials.mockResolvedValue({ credentials: [], deferredCredentials: [{ transactionId: 'later' }] })

    await expect(acceptCredentialOffer(offerUri, offer)).resolves.toMatchObject({ received: 0, deferred: 1 })
  })

  it('refuses an offer it cannot bind as unsupported, before redeeming its code', async () => {
    for (const [configuration, reason] of [
      [{ ...membership, cryptographic_binding_methods_supported: ['did:web'] }, /binds credentials to did:web/],
      [
        { ...membership, proof_types_supported: { jwt: { proof_signing_alg_values_supported: ['ES384'] } } },
        /none of the proof algorithms/,
      ],
      [{ ...membership, proof_types_supported: { jwt: { key_attestations_required: {} } } }, /key attestation/],
      [{ ...membership, proof_types_supported: undefined }, /does not bind this credential to a key/],
    ] as const) {
      const error = await acceptCredentialOffer(offerUri, offerFor(configuration)).catch((caught: unknown) => caught)
      expect(error).toBeInstanceOf(UnsupportedOfferError)
      expect((error as Error).message).toMatch(reason)
    }
    expect(requestToken).not.toHaveBeenCalled()
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('keeps a stored credential when only the summary update fails, and says so', async () => {
    requestCredentials.mockResolvedValue({ credentials: [{ record: fakeRecord('rec-1') }], deferredCredentials: [] })
    getAll.mockRejectedValue(new Error('IndexedDB closed'))

    const result = await acceptCredentialOffer(offerUri, offer)

    expect(result).toMatchObject({ received: 1, summaryUpdated: false })
    expect(deleteById).not.toHaveBeenCalled()
    expect(deleted).toHaveLength(0)
    expect(receiveResultMessage(result.received, result.deferred, result.summaryUpdated)).toBe(
      'The credential was stored, but the wallet summary could not be updated.',
    )
  })

  it('does not say a credential was stored when the issuer deferred it and the summary update failed', async () => {
    requestCredentials.mockResolvedValue({ credentials: [], deferredCredentials: [{ transactionId: 'later' }] })
    getAll.mockRejectedValue(new Error('IndexedDB closed'))

    const result = await acceptCredentialOffer(offerUri, offer)

    expect(result).toMatchObject({ received: 0, deferred: 1, summaryUpdated: false })
    expect(receiveResultMessage(result.received, result.deferred, result.summaryUpdated)).toMatch(
      /^The issuer will issue one credential later\./,
    )
  })

  it("reports its progress for this offer only, so a replaced offer's progress shows nowhere", async () => {
    requestCredentials.mockResolvedValue({ credentials: [{ record: fakeRecord('rec-1') }], deferredCredentials: [] })

    await acceptCredentialOffer(offerUri, offer)

    expect(sendMessage.mock.calls.map(([message]) => message)).toEqual([
      { type: 'OFFER_PROGRESS', offerUri, message: 'Requesting the credential… Keep this page open.' },
      { type: 'OFFER_PROGRESS', offerUri, message: 'Saving the credential…' },
    ])
  })
})
