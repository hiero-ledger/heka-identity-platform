import type { DidUpdateResult } from '@credo-ts/core'

import {
  DidDocument,
  DidDocumentRole,
  DidDocumentService,
  DidRecord,
  DidRepository,
  Kms,
  TypedArrayEncoder,
  VerificationMethod,
} from '@credo-ts/core'
import { UnprocessableEntityException } from '@nestjs/common'

import { TenantAgent } from 'common/agent'

import { UpdateDidOptions } from '../did-registrar.types'
import { DidHederaRegistrar } from '../methods'

const did = 'did:hedera:testnet:z6Mkowner_0.0.1'
const rootKey = `${did}#did-root-key`

const finished = (didDocument: DidDocument): DidUpdateResult => ({
  didState: { state: 'finished', did, didDocument },
  didDocumentMetadata: {},
  didRegistrationMetadata: {},
})

const failed = (reason: string): DidUpdateResult => ({
  didState: { state: 'failed', reason },
  didDocumentMetadata: {},
  didRegistrationMetadata: {},
})

function currentDocument() {
  return new DidDocument({
    id: did,
    verificationMethod: [
      new VerificationMethod({ id: rootKey, type: 'Ed25519VerificationKey2020', controller: did }),
      new VerificationMethod({ id: `${did}#key-1`, type: 'Ed25519VerificationKey2020', controller: did }),
    ],
    authentication: [rootKey, `${did}#key-1`],
    assertionMethod: [rootKey, `${did}#key-1`],
    service: [
      new DidDocumentService({ id: `${did}#svc-1`, type: 'LinkedDomains', serviceEndpoint: 'https://a' }),
      new DidDocumentService({ id: `${did}#svc-2`, type: 'LinkedDomains', serviceEndpoint: 'https://b' }),
    ],
  })
}

function options(overrides: Partial<UpdateDidOptions>): UpdateDidOptions {
  return {
    did,
    currentDidDocument: currentDocument(),
    addServices: [],
    removeServices: [],
    addVerificationMethods: [],
    removeVerificationMethods: [],
    ...overrides,
  }
}

describe('DidHederaRegistrar', () => {
  const registrar = new DidHederaRegistrar()
  let tenantAgent: TenantAgent
  let didRecord: DidRecord
  let didRepository: { findCreatedDid: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
  let generatedKeys: number

  beforeEach(() => {
    generatedKeys = 0
    didRecord = new DidRecord({
      did,
      role: DidDocumentRole.Created,
      didDocument: currentDocument(),
      keys: [{ kmsKeyId: 'root-kms', didDocumentRelativeKeyId: '#did-root-key' }],
    })
    didRepository = { findCreatedDid: vi.fn().mockResolvedValue(didRecord), update: vi.fn() }
    tenantAgent = {
      context: {},
      config: { logger: { warn: vi.fn() } },
      kms: {
        createKey: vi.fn(() => {
          generatedKeys++
          return Promise.resolve({
            keyId: `kms-${generatedKeys}`,
            publicJwk: {
              kty: 'OKP',
              crv: 'Ed25519',
              x: TypedArrayEncoder.toBase64Url(new Uint8Array(32).fill(generatedKeys)),
            },
          })
        }),
        deleteKey: vi.fn().mockResolvedValue(true),
      },
      dids: {
        update: vi.fn().mockResolvedValue(finished(currentDocument())),
        deactivate: vi.fn().mockResolvedValue(finished(new DidDocument({ id: did }))),
        resolve: vi.fn().mockResolvedValue({ didDocument: currentDocument(), didDocumentMetadata: {} }),
      },
      dependencyManager: {
        resolve: vi.fn((token: unknown) => (token === DidRepository ? didRepository : undefined)),
      },
    } as unknown as TenantAgent
  })

  test('protects the root key and supports update and deactivation', () => {
    expect(registrar.protectedKeyFragment).toBe('#did-root-key')
    expect(registrar.supportsUpdate).toBe(true)
    expect(registrar.supportsDeactivate).toBe(true)
  })

  test('adds services and new Ed25519 keys with addToDidDocument, by relative fragment', async () => {
    const result = await registrar.updateDid(
      tenantAgent,
      options({
        addServices: [{ id: '#svc-3', type: 'LinkedDomains', serviceEndpoint: 'https://example.com' }],
        addVerificationMethods: [
          { id: '#key-2', purposes: ['assertionMethod'] },
          { id: '#key-3', purposes: ['authentication', 'capabilityInvocation'] },
        ],
      }),
    )

    expect(result.didState.state).toBe('finished')
    expect(tenantAgent.kms.createKey).toHaveBeenCalledWith({ type: { kty: 'OKP', crv: 'Ed25519' } })
    expect(tenantAgent.dids.update).toHaveBeenCalledTimes(1)
    const [update] = vi.mocked(tenantAgent.dids.update).mock.calls[0]
    expect(update.didDocumentOperation).toBe('addToDidDocument')
    expect(update.secret).toEqual({
      keys: [
        { kmsKeyId: 'kms-1', didDocumentRelativeKeyId: '#key-2' },
        { kmsKeyId: 'kms-2', didDocumentRelativeKeyId: '#key-3' },
      ],
    })
    const document = update.didDocument as DidDocument
    expect(document.service).toEqual([
      expect.objectContaining({ id: '#svc-3', type: 'LinkedDomains', serviceEndpoint: 'https://example.com' }),
    ])
    expect(document.verificationMethod).toEqual([
      expect.objectContaining({
        id: '#key-2',
        type: 'Ed25519VerificationKey2020',
        controller: did,
        publicKeyMultibase: expect.stringMatching(/^z6Mk/),
      }),
      expect.objectContaining({ id: '#key-3', publicKeyMultibase: expect.stringMatching(/^z6Mk/) }),
    ])
    // Relationships carry the full verification method, which the SDK needs before the key exists
    expect(document.assertionMethod).toEqual([document.verificationMethod![0]])
    expect(document.authentication).toEqual([document.verificationMethod![1]])
    expect(document.capabilityInvocation).toEqual([document.verificationMethod![1]])
    expect(document.capabilityDelegation).toBeUndefined()
  })

  test('removes the current entries with removeFromDidDocument', async () => {
    // `#key-2` is not referenced from any relationship
    const currentDidDocument = currentDocument()
    currentDidDocument.verificationMethod!.push(
      new VerificationMethod({ id: `${did}#key-2`, type: 'Ed25519VerificationKey2020', controller: did }),
    )

    await registrar.updateDid(
      tenantAgent,
      options({ currentDidDocument, removeServices: ['#svc-2'], removeVerificationMethods: ['#key-2'] }),
    )

    expect(tenantAgent.dids.update).toHaveBeenCalledTimes(1)
    const [update] = vi.mocked(tenantAgent.dids.update).mock.calls[0]
    expect(update.didDocumentOperation).toBe('removeFromDidDocument')
    const document = update.didDocument as DidDocument
    expect(document.service?.map(({ id }) => id)).toEqual([`${did}#svc-2`])
    expect(document.verificationMethod?.map(({ id }) => id)).toEqual([`${did}#key-2`])
    expect(document.authentication).toBeUndefined()
    expect(document.assertionMethod).toBeUndefined()
    expect(tenantAgent.kms.createKey).not.toHaveBeenCalled()
  })

  test('refuses to remove a key referenced from a relationship (the SDK would leave a dangling reference)', async () => {
    const update = registrar.updateDid(
      tenantAgent,
      options({
        addServices: [{ id: '#svc-3', type: 'LinkedDomains', serviceEndpoint: 'https://example.com' }],
        removeVerificationMethods: ['#key-1'],
      }),
    )

    await expect(update).rejects.toThrow(UnprocessableEntityException)
    await expect(update).rejects.toThrow(
      'did:hedera cannot remove #key-1 while it is referenced from authentication, assertionMethod',
    )
    expect(tenantAgent.dids.update).not.toHaveBeenCalled()
    expect(tenantAgent.kms.createKey).not.toHaveBeenCalled()
  })

  test('adds before it removes, and never sets the whole document', async () => {
    await registrar.updateDid(
      tenantAgent,
      options({
        addServices: [{ id: '#svc-3', type: 'LinkedDomains', serviceEndpoint: 'https://example.com' }],
        removeServices: ['#svc-1'],
      }),
    )

    const operations = vi.mocked(tenantAgent.dids.update).mock.calls.map(([update]) => update.didDocumentOperation)
    expect(operations).toEqual(['addToDidDocument', 'removeFromDidDocument'])
    expect(operations).not.toContain('setDidDocument')
  })

  test('a failed update re-syncs the DID record from the ledger and keeps every key it may have sent', async () => {
    vi.mocked(tenantAgent.dids.update).mockResolvedValue(failed('Unable update DID: timeout'))
    // Only the first of the two new keys made it to the ledger
    const onLedger = currentDocument()
    onLedger.verificationMethod!.push(
      new VerificationMethod({ id: `${did}#key-2`, type: 'Ed25519VerificationKey2020', controller: did }),
    )
    vi.mocked(tenantAgent.dids.resolve).mockResolvedValue({
      didDocument: onLedger,
      didDocumentMetadata: {},
      didResolutionMetadata: {},
    })

    const result = await registrar.updateDid(
      tenantAgent,
      options({
        addVerificationMethods: [
          { id: '#key-2', purposes: [] },
          { id: '#key-3', purposes: [] },
        ],
        removeServices: ['#svc-1'],
      }),
    )

    expect(result.didState).toEqual({ state: 'failed', reason: 'Unable update DID: timeout' })
    // The removal is not attempted after the addition failed
    expect(tenantAgent.dids.update).toHaveBeenCalledTimes(1)
    expect(tenantAgent.dids.resolve).toHaveBeenCalledWith(did, { useCache: false, useLocalCreatedDidRecord: false })
    // `#key-3` may still land (its message may have been sent before the failure): its key is kept, not mapped
    expect(tenantAgent.kms.deleteKey).not.toHaveBeenCalled()
    expect(didRecord.didDocument).toBe(onLedger)
    expect(didRecord.keys).toEqual([
      { kmsKeyId: 'root-kms', didDocumentRelativeKeyId: '#did-root-key' },
      { kmsKeyId: 'kms-1', didDocumentRelativeKeyId: '#key-2' },
    ])
    expect(didRepository.update).toHaveBeenCalledWith(tenantAgent.context, didRecord)
    const [warning] = vi.mocked(tenantAgent.config.logger.warn).mock.calls[0]
    expect(warning).toContain('1 new key(s)')
    expect(warning).not.toMatch(/kms-\d/)
  })

  test('a failure of the removal after a finished addition keeps the added keys mapped', async () => {
    const afterAddition = currentDocument()
    afterAddition.verificationMethod!.push(
      new VerificationMethod({ id: `${did}#key-2`, type: 'Ed25519VerificationKey2020', controller: did }),
    )
    vi.mocked(tenantAgent.dids.update)
      .mockResolvedValueOnce(finished(afterAddition))
      .mockRejectedValueOnce(new Error('consensus timeout'))
    vi.mocked(tenantAgent.dids.resolve).mockResolvedValue({
      didDocument: afterAddition,
      didDocumentMetadata: {},
      didResolutionMetadata: {},
    })

    const result = await registrar.updateDid(
      tenantAgent,
      options({ addVerificationMethods: [{ id: '#key-2', purposes: [] }], removeServices: ['#svc-1'] }),
    )

    expect(result.didState).toEqual({ state: 'failed', reason: 'Unable to update DID: consensus timeout' })
    expect(tenantAgent.kms.deleteKey).not.toHaveBeenCalled()
    expect(didRecord.keys).toContainEqual({ kmsKeyId: 'kms-1', didDocumentRelativeKeyId: '#key-2' })
    expect(tenantAgent.config.logger.warn).not.toHaveBeenCalled()
  })

  test('deletes the new keys when the failure came before anything was sent', async () => {
    vi.mocked(tenantAgent.kms.createKey)
      .mockResolvedValueOnce({
        keyId: 'kms-1',
        publicJwk: { kty: 'OKP', crv: 'Ed25519', x: TypedArrayEncoder.toBase64Url(new Uint8Array(32).fill(1)) },
      } as never)
      .mockRejectedValueOnce(new Kms.KeyManagementError('storage unavailable'))

    const result = await registrar.updateDid(
      tenantAgent,
      options({
        addVerificationMethods: [
          { id: '#key-2', purposes: [] },
          { id: '#key-3', purposes: [] },
        ],
      }),
    )

    expect(result.didState.state).toBe('failed')
    expect(tenantAgent.dids.update).not.toHaveBeenCalled()
    expect(tenantAgent.kms.deleteKey).toHaveBeenCalledExactlyOnceWith({ keyId: 'kms-1' })
    expect(tenantAgent.dids.resolve).not.toHaveBeenCalled()
    expect(didRepository.update).not.toHaveBeenCalled()
  })

  test('keeps every key when the ledger state is unknown after a failure', async () => {
    vi.mocked(tenantAgent.dids.update).mockRejectedValue(new Error('network down'))
    vi.mocked(tenantAgent.dids.resolve).mockRejectedValue(new Error('network down'))

    const result = await registrar.updateDid(
      tenantAgent,
      options({ addVerificationMethods: [{ id: '#key-2', purposes: [] }] }),
    )

    expect(result.didState).toEqual({ state: 'failed', reason: 'Unable to update DID: network down' })
    expect(tenantAgent.kms.deleteKey).not.toHaveBeenCalled()
    expect(didRepository.update).not.toHaveBeenCalled()
    expect(tenantAgent.config.logger.warn).toHaveBeenCalledOnce()
  })

  test('a failing clean-up does not hide why the update failed', async () => {
    vi.mocked(tenantAgent.dids.update).mockResolvedValue(failed('Unable update DID: INSUFFICIENT_PAYER_BALANCE'))
    didRepository.update.mockRejectedValue(new Error('storage down'))

    const result = await registrar.updateDid(tenantAgent, options({ removeServices: ['#svc-1'] }))

    expect(result.didState).toEqual({ state: 'failed', reason: 'Unable update DID: INSUFFICIENT_PAYER_BALANCE' })
  })

  test('a KMS error is reported without the KMS key id', async () => {
    vi.mocked(tenantAgent.kms.createKey).mockRejectedValue(new Kms.KeyManagementKeyExistsError('kms-key-id', 'askar'))

    const result = await registrar.updateDid(
      tenantAgent,
      options({ addVerificationMethods: [{ id: '#key-2', purposes: [] }] }),
    )

    expect(result.didState).toEqual({ state: 'failed', reason: 'Unable to update DID: key management error' })
    expect(JSON.stringify(result)).not.toContain('kms-key-id')
  })

  test('deactivates through Credo, keeping the keys', async () => {
    const result = await registrar.deactivateDid(tenantAgent, did)

    expect(result.didState.state).toBe('finished')
    expect(tenantAgent.dids.deactivate).toHaveBeenCalledWith({ did })
    expect(tenantAgent.kms.deleteKey).not.toHaveBeenCalled()
  })
})
