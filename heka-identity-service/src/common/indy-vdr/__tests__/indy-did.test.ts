import '@hyperledger/indy-vdr-nodejs'
import '@openwallet-foundation/askar-nodejs'
import {
  AgentContext,
  DidDocument,
  DidDocumentService,
  DidRecord,
  DidRepository,
  getEd25519VerificationKey2020,
  JsonTransformer,
  Kms,
  TypedArrayEncoder,
} from '@credo-ts/core'
import { IndyVdrIndyDidResolver, IndyVdrPoolService } from '@credo-ts/indy-vdr'
import { GetNymRequest, IndyVdrRequest } from '@hyperledger/indy-vdr-shared'
import { Key, KeyAlgorithm } from '@openwallet-foundation/askar-shared'

import { indyBaseDidDocument, IndyDidRegistrar, IndyDidResolver } from '../indy-did'

const ownerKey = Key.generate(KeyAlgorithm.Ed25519)
const VERKEY = TypedArrayEncoder.toBase58(ownerKey.publicBytes)
const DID = `did:indy:bcovrin:test:${TypedArrayEncoder.toBase58(ownerKey.publicBytes.slice(0, 16))}`
const ED25519_2020_CONTEXT = 'https://w3id.org/security/suites/ed25519-2020/v1'

function context(ledger: { verkey: string | null; diddocContent?: string }) {
  const didRecord = new DidRecord({
    did: DID,
    role: 'created' as DidRecord['role'],
    didDocument: indyBaseDidDocument(DID, VERKEY),
    keys: [{ kmsKeyId: 'owner-key', didDocumentRelativeKeyId: '#verkey' }],
  })
  const written: Array<{ operation: Record<string, unknown> }> = []
  const pool = {
    prepareWriteRequest: vi.fn((_agentContext: unknown, request: IndyVdrRequest, _signingKey: unknown) =>
      Promise.resolve(request),
    ),
    submitRequest: vi.fn((request: IndyVdrRequest) => {
      if (request instanceof GetNymRequest) {
        return Promise.resolve({ result: { data: JSON.stringify(ledger) } })
      }
      written.push(JSON.parse(request.body) as { operation: Record<string, unknown> })
      return Promise.resolve({})
    }),
  }
  const didRepository = { findCreatedDid: vi.fn().mockResolvedValue(didRecord), update: vi.fn() }
  const agentContext = {
    dependencyManager: {
      resolve: (token: unknown) =>
        token === DidRepository
          ? didRepository
          : token === IndyVdrPoolService
            ? { getPoolForNamespace: () => pool }
            : {},
    },
  } as unknown as AgentContext
  return { agentContext, didRecord, didRepository, pool, written }
}

function updatedDocument(): DidDocument {
  const json = JsonTransformer.toJSON(indyBaseDidDocument(DID, VERKEY)) as Record<string, unknown[]>
  const newKey = Key.generate(KeyAlgorithm.Ed25519)
  const verificationMethod = getEd25519VerificationKey2020({
    id: `${DID}#key-1`,
    controller: DID,
    publicJwk: Kms.PublicJwk.fromPublicJwk({ kty: 'OKP', crv: 'Ed25519', x: newKey.jwkPublic.x }),
  })
  json['@context'].push(ED25519_2020_CONTEXT)
  json.verificationMethod.push(JsonTransformer.toJSON(verificationMethod))
  json.assertionMethod = [verificationMethod.id]
  json.service = [
    JsonTransformer.toJSON(
      new DidDocumentService({ id: `${DID}#svc-1`, type: 'LinkedDomains', serviceEndpoint: 'https://a' }),
    ),
  ]
  return JsonTransformer.fromJSON(json, DidDocument)
}

describe('IndyDidRegistrar', () => {
  const registrar = new IndyDidRegistrar()

  test("update writes what the document adds to the verkey's document as the NYM's diddocContent", async () => {
    const { agentContext, didRecord, didRepository, pool, written } = context({ verkey: VERKEY })
    const didDocument = updatedDocument()
    const newKeys = [{ kmsKeyId: 'new-key', didDocumentRelativeKeyId: '#key-1' }]

    const result = await registrar.update(agentContext, {
      did: DID,
      didDocumentOperation: 'setDidDocument',
      didDocument,
      secret: { keys: newKeys },
    })

    expect(result.didState).toMatchObject({ state: 'finished', did: DID })
    expect(pool.prepareWriteRequest.mock.calls[0][2]).toMatchObject({ keyId: 'owner-key' })
    const [{ operation }] = written
    // No verkey: the ledger keeps it
    expect(operation).not.toHaveProperty('verkey')
    expect(JSON.parse(operation.diddocContent as string)).toEqual({
      '@context': [ED25519_2020_CONTEXT],
      verificationMethod: [expect.objectContaining({ id: `${DID}#key-1` })],
      assertionMethod: [`${DID}#key-1`],
      service: [{ id: `${DID}#svc-1`, type: 'LinkedDomains', serviceEndpoint: 'https://a' }],
    })
    expect(didRecord.didDocument).toBe(didDocument)
    expect(didRecord.keys).toEqual([{ kmsKeyId: 'owner-key', didDocumentRelativeKeyId: '#verkey' }, ...newKeys])
    expect(didRepository.update).toHaveBeenCalled()
  })

  test('update sends nothing when the document changes the key #verkey', async () => {
    const { agentContext, written } = context({ verkey: VERKEY })
    const json = JsonTransformer.toJSON(indyBaseDidDocument(DID, VERKEY)) as {
      verificationMethod: Array<{ publicKeyBase58: string }>
    }
    json.verificationMethod[0].publicKeyBase58 = TypedArrayEncoder.toBase58(new Uint8Array(32).fill(7))

    const result = await registrar.update(agentContext, {
      did: DID,
      didDocument: JsonTransformer.fromJSON(json, DidDocument),
    })

    expect(result.didState).toMatchObject({ state: 'failed', reason: expect.stringContaining('#verkey') })
    expect(result.didRegistrationMetadata).toEqual({ transactionSubmitted: false })
    expect(written).toHaveLength(0)
  })

  test('an update whose response is lost succeeds when the ledger holds its diddocContent', async () => {
    const ledger: { verkey: string; diddocContent?: string } = { verkey: VERKEY }
    const { agentContext, pool } = context(ledger)
    pool.submitRequest.mockImplementationOnce((request: IndyVdrRequest) => {
      ledger.diddocContent = (
        JSON.parse(request.body) as { operation: { diddocContent: string } }
      ).operation.diddocContent
      return Promise.reject(new Error('Pool timeout'))
    })

    const result = await registrar.update(agentContext, { did: DID, didDocument: updatedDocument() })

    expect(result.didState).toMatchObject({ state: 'finished' })
  })

  test('deactivate sets the verkey to null', async () => {
    const { agentContext, written } = context({ verkey: VERKEY })

    const result = await registrar.deactivate(agentContext, { did: DID })

    expect(result.didState.state).toBe('finished')
    expect(result.didDocumentMetadata).toEqual({ deactivated: true })
    expect(written[0].operation).toMatchObject({ dest: DID.split(':').pop(), verkey: null })
  })

  test('with an endorserDid, update and deactivate are endorsed and signed by the endorser too', async () => {
    const endorserKey = Key.generate(KeyAlgorithm.Ed25519)
    const endorserVerkey = TypedArrayEncoder.toBase58(endorserKey.publicBytes)
    const endorserNamespaceId = TypedArrayEncoder.toBase58(endorserKey.publicBytes.slice(0, 16))
    const endorserDid = `did:indy:bcovrin:test:${endorserNamespaceId}`
    const endorserRecord = new DidRecord({
      did: endorserDid,
      role: 'created' as DidRecord['role'],
      didDocument: indyBaseDidDocument(endorserDid, endorserVerkey),
      keys: [{ kmsKeyId: 'endorser-key', didDocumentRelativeKeyId: '#verkey' }],
    })
    const { agentContext, didRecord, didRepository, pool } = context({ verkey: VERKEY })
    didRepository.findCreatedDid.mockImplementation((_context: unknown, did: string) =>
      Promise.resolve(did === endorserDid ? endorserRecord : didRecord),
    )
    const kms = { sign: vi.fn().mockResolvedValue({ signature: new Uint8Array(64).fill(1) }) }
    const resolve = agentContext.dependencyManager.resolve.bind(agentContext.dependencyManager)
    agentContext.dependencyManager.resolve = ((token: unknown) =>
      token === Kms.KeyManagementApi ? kms : resolve(token as never)) as typeof resolve

    await registrar.update(agentContext, { did: DID, didDocument: updatedDocument(), options: { endorserDid } })
    await registrar.deactivate(agentContext, { did: DID, options: { endorserDid } })

    for (const [, request, signingKey, endorser] of pool.prepareWriteRequest.mock.calls) {
      expect(signingKey).toMatchObject({ keyId: 'owner-key' })
      expect(endorser).toBe(endorserDid)
      expect(JSON.parse(request.body)).toMatchObject({ signatures: { [endorserNamespaceId]: expect.any(String) } })
    }
    expect(kms.sign).toHaveBeenCalledTimes(2)
    expect(kms.sign.mock.calls[0][0]).toMatchObject({ keyId: 'endorser-key', algorithm: 'EdDSA' })
  })
})

describe('IndyDidResolver', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('reports a DID whose verkey is null as deactivated', async () => {
    const { agentContext } = context({ verkey: null })
    vi.spyOn(IndyVdrIndyDidResolver.prototype, 'resolve').mockResolvedValue({
      didDocument: null,
      didDocumentMetadata: {},
      didResolutionMetadata: { error: 'notFound' },
    })

    const result = await new IndyDidResolver().resolve(agentContext, DID)

    expect(result.didDocumentMetadata).toEqual({ deactivated: true })
    expect(result.didDocument?.id).toBe(DID)
  })

  test('keeps the failure of a DID that is not on the ledger', async () => {
    const { agentContext, pool } = context({ verkey: VERKEY })
    pool.submitRequest.mockResolvedValue({ result: { data: null } })
    const notFound = { didDocument: null, didDocumentMetadata: {}, didResolutionMetadata: { error: 'notFound' } }
    vi.spyOn(IndyVdrIndyDidResolver.prototype, 'resolve').mockResolvedValue(notFound)

    expect(await new IndyDidResolver().resolve(agentContext, DID)).toBe(notFound)
  })
})
