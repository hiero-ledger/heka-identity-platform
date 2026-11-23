import { DidDocument, Kms, TypedArrayEncoder } from '@credo-ts/core'
import '@openwallet-foundation/askar-nodejs'
import { Key, KeyAlgorithm } from '@openwallet-foundation/askar-shared'

import { TenantAgent } from 'common/agent'
import { INSECURE_DEFAULTS } from 'config/insecure-defaults'

import { ensureIndyEndorserDid } from '../methods/did-indy'

const ENDORSER_DID = 'did:indy:bcovrin:test:4bbYgjU6JbV4DShPbGoQcA'
const SEED = INSECURE_DEFAULTS.INDY_ENDORSER_SEED
const endorserKey = Key.fromSecretBytes({
  algorithm: KeyAlgorithm.Ed25519,
  secretKey: TypedArrayEncoder.fromUtf8String(SEED),
})

function tenantAgentWith(recordKeyId: string | undefined, walletKeyIds: string[]) {
  return {
    dids: {
      getCreatedDids: vi
        .fn()
        .mockResolvedValue(
          recordKeyId
            ? [{ did: ENDORSER_DID, keys: [{ kmsKeyId: recordKeyId, didDocumentRelativeKeyId: '#verkey' }] }]
            : [],
        ),
      import: vi.fn(),
    },
    kms: {
      getPublicKey: ({ keyId }: { keyId: string }) =>
        walletKeyIds.includes(keyId)
          ? Promise.resolve({})
          : Promise.reject(new Kms.KeyManagementKeyNotFoundError(keyId, ['askar'])),
      importKey: vi.fn().mockResolvedValue({ keyId: 'imported-key' }),
    },
  }
}

describe('ensureIndyEndorserDid', () => {
  test('imports the endorser key and DID into a wallet without them', async () => {
    const tenantAgent = tenantAgentWith(undefined, [])

    await ensureIndyEndorserDid(tenantAgent as unknown as TenantAgent, ENDORSER_DID, SEED)

    const [{ privateJwk }] = tenantAgent.kms.importKey.mock.calls[0] as [{ privateJwk: Kms.KmsJwkPrivate }]
    expect(privateJwk).toMatchObject({ kty: 'OKP', crv: 'Ed25519', x: endorserKey.jwkPublic.x })
    expect(tenantAgent.dids.import).toHaveBeenCalledWith(
      expect.objectContaining({
        did: ENDORSER_DID,
        overwrite: true,
        keys: [{ kmsKeyId: 'imported-key', didDocumentRelativeKeyId: '#verkey' }],
      }),
    )
    // The ledger's verkey of the endorser DID, without a ledger lookup
    const [{ didDocument }] = tenantAgent.dids.import.mock.calls[0] as [{ didDocument: DidDocument }]
    expect(didDocument.dereferenceKey('#verkey').publicKeyBase58).toBe(
      TypedArrayEncoder.toBase58(endorserKey.publicBytes),
    )
  })

  test('leaves a wallet whose record has its key', async () => {
    const tenantAgent = tenantAgentWith('endorser-key', ['endorser-key'])

    await ensureIndyEndorserDid(tenantAgent as unknown as TenantAgent, ENDORSER_DID, SEED)

    expect(tenantAgent.kms.importKey).not.toHaveBeenCalled()
    expect(tenantAgent.dids.import).not.toHaveBeenCalled()
  })

  test('imports the key again when the record names a key the wallet lacks', async () => {
    const tenantAgent = tenantAgentWith('platform-indy-endorser', [])

    await ensureIndyEndorserDid(tenantAgent as unknown as TenantAgent, ENDORSER_DID, SEED)

    expect(tenantAgent.kms.importKey).toHaveBeenCalled()
    expect(tenantAgent.dids.import).toHaveBeenCalled()
  })
})
