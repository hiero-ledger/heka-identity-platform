import { AgentContext } from '@credo-ts/core'

import { DidDocument, DidRegistry } from '../../ledger'
import { IndyBesuDidResolver } from '../IndyBesuDidResolver'

const DID = 'did:indybesu:testnet:0x2c7536E3605D9C16a7a3D7b1898e529396a65c23'

const ledgerDocument: DidDocument = {
  '@context': ['https://www.w3.org/ns/did/v1', 'https://w3id.org/security/suites/ed25519-2020/v1'],
  id: DID,
  controller: [],
  verificationMethod: [
    {
      id: `${DID}#KEY-1`,
      type: 'EcdsaSecp256k1VerificationKey2019',
      controller: DID,
      publicKeyBase58: 'owner-public-key',
    },
    {
      id: `${DID}#key-2`,
      type: 'Ed25519VerificationKey2020',
      controller: DID,
      publicKeyMultibase: 'z6MkqsWu2GzWZoMToNxaEAbQWG75EC2Dp769HUygNYLJtX2E',
    },
  ],
  authentication: [`${DID}#KEY-1`],
  assertionMethod: [`${DID}#KEY-1`, `${DID}#key-2`],
  capabilityInvocation: [],
  capabilityDelegation: [],
  keyAgreement: [],
  service: [],
  alsoKnownAs: [],
}

describe('IndyBesuDidResolver', () => {
  const resolver = new IndyBesuDidResolver()
  let resolveDid: ReturnType<typeof vi.fn>
  let agentContext: AgentContext

  beforeEach(() => {
    resolveDid = vi.fn()
    agentContext = {
      dependencyManager: { resolve: vi.fn((token: unknown) => (token === DidRegistry ? { resolveDid } : undefined)) },
    } as unknown as AgentContext
  })

  test('maps the ledger metadata, with the deactivation, and keeps the document of a deactivated DID', async () => {
    resolveDid.mockResolvedValue({
      document: ledgerDocument,
      metadata: { owner: '0x2c75', created: 1792614750, updated: 1792614756, versionId: 2840, deactivated: true },
    })

    const result = await resolver.resolve(agentContext, DID)

    expect(result.didDocumentMetadata).toEqual({
      created: '2026-10-21T20:32:30.000Z',
      updated: '2026-10-21T20:32:36.000Z',
      versionId: '2840',
      deactivated: true,
    })
    expect(result.didDocument?.verificationMethod?.map(({ id }) => id)).toEqual([`${DID}#KEY-1`, `${DID}#key-2`])
  })

  test('an active DID has no deactivated flag', async () => {
    resolveDid.mockResolvedValue({
      document: ledgerDocument,
      metadata: { owner: '0x2c75', created: 1792614750, updated: 1792614750, versionId: 2836, deactivated: false },
    })

    expect((await resolver.resolve(agentContext, DID)).didDocumentMetadata.deactivated).toBeUndefined()
  })

  test('keeps the key material of both key types', async () => {
    resolveDid.mockResolvedValue({ document: ledgerDocument, metadata: {} })

    const { didDocument } = await resolver.resolve(agentContext, DID)

    expect(didDocument?.verificationMethod?.[0].publicKeyBase58).toBe('owner-public-key')
    expect(didDocument?.verificationMethod?.[1].publicKeyMultibase).toBe(
      'z6MkqsWu2GzWZoMToNxaEAbQWG75EC2Dp769HUygNYLJtX2E',
    )
  })

  test('reports a ledger error as a resolution error', async () => {
    resolveDid.mockRejectedValue(new Error('RPC unavailable'))

    const result = await resolver.resolve(agentContext, DID)

    expect(result.didDocument).toBeNull()
    expect(result.didResolutionMetadata).toEqual({
      error: 'unknownError',
      message: `resolver_error: Unable to resolve did '${DID}': RPC unavailable`,
    })
  })
})
