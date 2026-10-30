import {
  AgentContext,
  DidDocument,
  DidDocumentRole,
  DidDocumentService,
  DidRecord,
  DidRepository,
  DidsApi,
  Kms,
  TypedArrayEncoder,
  VerificationMethod,
} from '@credo-ts/core'
import { getBytes, SigningKey } from 'ethers'

import { DidRegistry, IndyBesuSigner, TransactionOutcomeUnknownError } from '../../ledger'
import { toIndyBesuDidDocument } from '../DidTypesMapping'
import { IndyBesuDidRegistrar, isNothingSubmitted } from '../IndyBesuDidRegistrar'

const OWNER_PRIVATE_KEY = '4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318'
const OWNER_ADDRESS = '0x2c7536E3605D9C16a7a3D7b1898e529396a65c23'
const DID = `did:indybesu:testnet:${OWNER_ADDRESS}`

function secp256k1PublicJwk(privateKeyHex: string): Kms.KmsJwkPublicAsymmetric {
  const uncompressed = getBytes(new SigningKey(`0x${privateKeyHex}`).publicKey)
  return {
    kty: 'EC',
    crv: 'secp256k1',
    x: TypedArrayEncoder.toBase64Url(uncompressed.slice(1, 33)),
    y: TypedArrayEncoder.toBase64Url(uncompressed.slice(33, 65)),
  }
}

function registrarContext() {
  const didRegistry = {
    endorseDid: vi.fn(),
    updateDid: vi.fn(),
    deactivateDid: vi.fn(),
    resolveDid: vi.fn(),
  }
  const didsApi = { import: vi.fn() }
  const kms = {
    createKey: vi.fn().mockResolvedValue({ keyId: 'owner-key', publicJwk: secp256k1PublicJwk(OWNER_PRIVATE_KEY) }),
    deleteKey: vi.fn().mockResolvedValue(true),
  }
  const didRepository = { findCreatedDid: vi.fn(), update: vi.fn() }
  const logger = { warn: vi.fn() }
  const agentContext = {
    config: { logger },
    dependencyManager: {
      resolve: vi.fn((token: unknown) => {
        if (token === DidRegistry) return didRegistry
        if (token === DidsApi) return didsApi
        if (token === DidRepository) return didRepository
        return kms
      }),
    },
  } as unknown as AgentContext
  return { agentContext, didRegistry, didsApi, kms, didRepository, logger }
}

describe('IndyBesuDidRegistrar', () => {
  const registrar = new IndyBesuDidRegistrar()
  let context: ReturnType<typeof registrarContext>

  beforeEach(() => {
    context = registrarContext()
    vi.spyOn(IndyBesuSigner, 'create').mockImplementation((_agentContext, keyId) =>
      Promise.resolve({ address: keyId === 'owner-key' ? OWNER_ADDRESS : '0xEndorser' } as IndyBesuSigner),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('create', () => {
    const createOptions = { method: 'indybesu', options: { network: 'testnet', endorserKeyId: 'endorser' } } as const

    test('writes the DID of the new key, endorsed, and keeps the owner key as `#KEY-1`', async () => {
      const result = await registrar.create(context.agentContext, createOptions)

      expect(result.didState).toMatchObject({ state: 'finished', did: DID })
      const [ledgerDocument, identity, endorser] = context.didRegistry.endorseDid.mock.calls[0]
      expect(identity.address).toBe(OWNER_ADDRESS)
      expect(endorser.address).toBe('0xEndorser')
      // Plain JSON, with the owner key first and one key-material property
      expect(ledgerDocument).toEqual({
        '@context': ['https://www.w3.org/ns/did/v1'],
        id: DID,
        controller: [],
        verificationMethod: [
          {
            id: `${DID}#KEY-1`,
            type: 'EcdsaSecp256k1VerificationKey2019',
            controller: DID,
            publicKeyBase58: expect.any(String),
          },
        ],
        authentication: [`${DID}#KEY-1`],
        assertionMethod: [`${DID}#KEY-1`],
        capabilityInvocation: [],
        capabilityDelegation: [],
        keyAgreement: [],
        service: [],
        alsoKnownAs: [],
      })
      expect(context.didsApi.import).toHaveBeenCalledWith(
        expect.objectContaining({ did: DID, keys: [{ kmsKeyId: 'owner-key', didDocumentRelativeKeyId: '#KEY-1' }] }),
      )
      expect(context.kms.deleteKey).not.toHaveBeenCalled()
    })

    test('deletes the generated key when the ledger write fails', async () => {
      context.didRegistry.endorseDid.mockRejectedValue(new Error('Ledger Client: Transaction reverted'))

      const result = await registrar.create(context.agentContext, createOptions)

      expect(result.didState).toEqual({
        state: 'failed',
        reason: 'unknownError: Ledger Client: Transaction reverted',
      })
      expect(context.kms.deleteKey).toHaveBeenCalledWith({ keyId: 'owner-key' })
      expect(context.didsApi.import).not.toHaveBeenCalled()
    })

    test('keeps the generated key when the transaction was sent but not confirmed (it may still be mined)', async () => {
      context.didRegistry.endorseDid.mockRejectedValue(new TransactionOutcomeUnknownError(new Error('receipt timeout')))

      const result = await registrar.create(context.agentContext, createOptions)

      expect(result.didState).toEqual({ state: 'failed', reason: 'unknownError: receipt timeout' })
      expect(context.kms.deleteKey).not.toHaveBeenCalled()
      expect(context.logger.warn).toHaveBeenCalledOnce()
      expect(JSON.stringify(context.logger.warn.mock.calls)).not.toContain('owner-key')
    })

    test('keeps the key of a DID that is already on the ledger', async () => {
      context.didsApi.import.mockRejectedValue(new Error('storage down'))

      const result = await registrar.create(context.agentContext, createOptions)

      expect(result.didState.state).toBe('failed')
      expect(context.kms.deleteKey).not.toHaveBeenCalled()
    })
  })

  describe('update and deactivate', () => {
    const ownerKey = new VerificationMethod({
      id: `${DID}#KEY-1`,
      type: 'EcdsaSecp256k1VerificationKey2019',
      controller: DID,
      publicKeyBase58: 'owner-public-key',
    })
    const document = (extra: Partial<ConstructorParameters<typeof DidDocument>[0]> = {}) =>
      new DidDocument({
        context: ['https://www.w3.org/ns/did/v1'],
        id: DID,
        verificationMethod: [ownerKey],
        authentication: [ownerKey.id],
        assertionMethod: [ownerKey.id],
        ...extra,
      })
    const newDocument = () =>
      document({
        service: [new DidDocumentService({ id: `${DID}#svc-1`, type: 'LinkedDomains', serviceEndpoint: 'https://a' })],
        verificationMethod: [
          ownerKey,
          new VerificationMethod({
            id: `${DID}#key-2`,
            type: 'Ed25519VerificationKey2020',
            controller: DID,
            publicKeyMultibase: 'z6Mk2',
          }),
        ],
      })
    const newKeys = [{ kmsKeyId: 'new-key', didDocumentRelativeKeyId: '#key-2' }]
    let didRecord: DidRecord

    beforeEach(() => {
      didRecord = new DidRecord({
        did: DID,
        role: DidDocumentRole.Created,
        didDocument: document(),
        keys: [
          { kmsKeyId: 'owner-key', didDocumentRelativeKeyId: '#KEY-1' },
          // A key of a verification method that is no longer in the document
          { kmsKeyId: 'stale-key', didDocumentRelativeKeyId: '#key-9' },
        ],
      })
      context.didRepository.findCreatedDid.mockResolvedValue(didRecord)
      context.didRegistry.resolveDid.mockResolvedValue({
        document: toIndyBesuDidDocument(document()),
        metadata: { deactivated: false },
      })
    })

    test('update: replaces the document, signed by the DID account, then updates the DID record', async () => {
      const result = await registrar.update(context.agentContext, {
        did: DID,
        didDocumentOperation: 'setDidDocument',
        didDocument: newDocument(),
        secret: { keys: newKeys },
      })

      expect(result.didState).toMatchObject({ state: 'finished', did: DID })
      expect(IndyBesuSigner.create).toHaveBeenCalledWith(context.agentContext, 'owner-key')
      expect(IndyBesuSigner.create).not.toHaveBeenCalledWith(context.agentContext, 'endorser')
      const [ledgerDocument, signer] = context.didRegistry.updateDid.mock.calls[0]
      expect(ledgerDocument).toEqual(toIndyBesuDidDocument(newDocument()))
      expect(signer.address).toBe(OWNER_ADDRESS)
      expect(didRecord.didDocument?.service?.[0].id).toBe(`${DID}#svc-1`)
      expect(didRecord.keys).toEqual([
        { kmsKeyId: 'owner-key', didDocumentRelativeKeyId: '#KEY-1' },
        { kmsKeyId: 'new-key', didDocumentRelativeKeyId: '#key-2' },
      ])
      expect(context.didRepository.update).toHaveBeenCalledWith(context.agentContext, didRecord)
      expect(context.kms.deleteKey).not.toHaveBeenCalled()
    })

    test('update: a failed write with the ledger unchanged fails and keeps the record and the new keys', async () => {
      context.didRegistry.updateDid.mockRejectedValue(
        new TransactionOutcomeUnknownError(new Error('Ledger Client: Transaction reverted: 0xe9aeaecd')),
      )

      const result = await registrar.update(context.agentContext, {
        did: DID,
        didDocument: newDocument(),
        secret: { keys: newKeys },
      })

      expect(result.didState).toEqual({ state: 'failed', reason: 'Ledger Client: Transaction reverted: 0xe9aeaecd' })
      // The transaction was sent: the caller must not delete the new keys
      expect(isNothingSubmitted(result)).toBe(false)
      expect(context.kms.deleteKey).not.toHaveBeenCalled()
      expect(context.didRepository.update).not.toHaveBeenCalled()
      expect(didRecord.didDocument?.service).toBeUndefined()
    })

    test('update: a failure before the transaction is sent says that nothing was submitted', async () => {
      // e.g. building or signing the transaction
      context.didRegistry.updateDid.mockRejectedValue(new Error('nonce unavailable'))

      const result = await registrar.update(context.agentContext, {
        did: DID,
        didDocument: newDocument(),
        secret: { keys: newKeys },
      })

      expect(result.didState).toEqual({ state: 'failed', reason: 'nonce unavailable' })
      expect(isNothingSubmitted(result)).toBe(true)
    })

    test('update: a KMS error is reported without the KMS key id', async () => {
      vi.mocked(IndyBesuSigner.create).mockRejectedValue(new Kms.KeyManagementKeyNotFoundError('owner-key', ['askar']))

      const result = await registrar.update(context.agentContext, { did: DID, didDocument: newDocument() })

      expect(result.didState).toEqual({ state: 'failed', reason: 'A key of the DID is not available in the wallet' })
      expect(JSON.stringify(result)).not.toContain('owner-key')
      expect(isNothingSubmitted(result)).toBe(true)
    })

    test('update: a failed wait for a write that made it to the ledger counts as written', async () => {
      context.didRegistry.updateDid.mockRejectedValue(new Error('timeout'))
      // The ledger returns the document without its empty properties, in its own property order
      const { capabilityDelegation, capabilityInvocation, keyAgreement, alsoKnownAs, ...written } =
        toIndyBesuDidDocument(newDocument())
      expect([capabilityDelegation, capabilityInvocation, keyAgreement, alsoKnownAs]).toEqual([[], [], [], []])
      context.didRegistry.resolveDid
        .mockResolvedValueOnce({ document: toIndyBesuDidDocument(document()), metadata: {} })
        .mockResolvedValueOnce({ document: written, metadata: {} })

      const result = await registrar.update(context.agentContext, {
        did: DID,
        didDocument: newDocument(),
        secret: { keys: newKeys },
      })

      expect(result.didState.state).toBe('finished')
      expect(context.kms.deleteKey).not.toHaveBeenCalled()
      expect(context.didRepository.update).toHaveBeenCalled()
    })

    test('update: the owner key must stay first and unchanged', async () => {
      const changedOwner = newDocument()
      changedOwner.verificationMethod = [changedOwner.verificationMethod![1], ownerKey]

      const result = await registrar.update(context.agentContext, {
        did: DID,
        didDocument: changedOwner,
        secret: { keys: newKeys },
      })

      expect(result.didState).toMatchObject({ state: 'failed', reason: expect.stringContaining('#KEY-1') })
      expect(isNothingSubmitted(result)).toBe(true)
      expect(context.didRegistry.updateDid).not.toHaveBeenCalled()
      expect(context.kms.deleteKey).not.toHaveBeenCalled()
    })

    test('update: a DID that is not in the wallet fails without a write', async () => {
      context.didRepository.findCreatedDid.mockResolvedValue(null)

      const result = await registrar.update(context.agentContext, { did: DID, didDocument: newDocument() })

      expect(result.didState).toEqual({ state: 'failed', reason: 'DID not found in this wallet' })
      expect(context.didRegistry.updateDid).not.toHaveBeenCalled()
    })

    test('deactivate: sent by the DID account, the document is kept', async () => {
      const result = await registrar.deactivate(context.agentContext, { did: DID })

      expect(result.didState).toMatchObject({ state: 'finished', did: DID, didDocument: didRecord.didDocument })
      expect(result.didDocumentMetadata).toEqual({ deactivated: true })
      const [did, signer] = context.didRegistry.deactivateDid.mock.calls[0]
      expect(did).toBe(DID)
      expect(signer.address).toBe(OWNER_ADDRESS)
      expect(context.kms.deleteKey).not.toHaveBeenCalled()
    })

    test('deactivate: a failed write fails unless the ledger reports the DID deactivated', async () => {
      context.didRegistry.deactivateDid.mockRejectedValue(new Error('RPC unavailable'))

      expect((await registrar.deactivate(context.agentContext, { did: DID })).didState).toEqual({
        state: 'failed',
        reason: 'RPC unavailable',
      })

      context.didRegistry.resolveDid.mockResolvedValue({
        document: toIndyBesuDidDocument(document()),
        metadata: { deactivated: true },
      })
      expect((await registrar.deactivate(context.agentContext, { did: DID })).didState.state).toBe('finished')
    })
  })
})
