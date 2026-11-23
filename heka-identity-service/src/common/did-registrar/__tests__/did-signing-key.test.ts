import { generateKeyPairSync } from 'crypto'

import {
  DidDocument,
  DidDocumentKey,
  DidDocumentRole,
  DidRecord,
  getEd25519VerificationKey2020,
  Kms,
  VerificationMethod,
} from '@credo-ts/core'
import { createMock } from '@golevelup/ts-vitest'

import { TenantAgent } from 'common/agent'

import { selectSigningKey } from '../did-signing-key'

const did = 'did:hedera:testnet:z6Mkowner_0.0.1'

function newKey(): Kms.KmsJwkPublicOkp & { crv: 'Ed25519' } {
  const { x } = generateKeyPairSync('ed25519').publicKey.export({ format: 'jwk' })
  return { kty: 'OKP', crv: 'Ed25519', x: x! }
}

function method(fragment: string, jwk: Kms.KmsJwkPublicOkp & { crv: 'Ed25519' }): VerificationMethod {
  return getEd25519VerificationKey2020({
    id: `${did}${fragment}`,
    controller: did,
    publicJwk: Kms.PublicJwk.fromPublicJwk(jwk),
  })
}

function document(...methods: VerificationMethod[]): DidDocument {
  return new DidDocument({
    id: did,
    verificationMethod: methods,
    assertionMethod: methods.map(({ id }) => id),
    authentication: methods.map(({ id }) => id),
  })
}

describe('selectSigningKey', () => {
  const key1 = newKey()
  const key2 = newKey()
  const ledger = document(method('#key-1', key1), method('#key-2', key2))

  // What the wallet holds: KMS key ids → public keys
  let kms: Record<string, Kms.KmsJwkPublicOkp>
  let tenantAgent: TenantAgent

  const withRecord = (didDocument: DidDocument | undefined, keys: DidDocumentKey[]) => {
    tenantAgent = createMock<TenantAgent>({
      dids: {
        getCreatedDids: vi
          .fn()
          .mockResolvedValue([new DidRecord({ did, role: DidDocumentRole.Created, didDocument, keys })]),
      },
      kms: {
        getPublicKey: vi.fn(({ keyId }: { keyId: string }) =>
          kms[keyId] ? Promise.resolve(kms[keyId]) : Promise.reject(new Error('key not found')),
        ),
      },
    })
  }

  beforeEach(() => {
    kms = { 'kms-1': key1, 'kms-2': key2 }
    withRecord(ledger, [
      { kmsKeyId: 'kms-1', didDocumentRelativeKeyId: '#key-1' },
      { kmsKeyId: 'kms-2', didDocumentRelativeKeyId: '#key-2' },
    ])
  })

  test('the first key of the purposes, when the ledger, the record and the KMS agree on it', async () => {
    await expect(selectSigningKey(tenantAgent, ledger, ['assertionMethod'])).resolves.toEqual({
      didUrl: `${did}#key-1`,
    })
  })

  test('skips a key the wallet does not map (it landed after its update failed) and takes the next', async () => {
    withRecord(ledger, [{ kmsKeyId: 'kms-2', didDocumentRelativeKeyId: '#key-2' }])

    await expect(selectSigningKey(tenantAgent, ledger, ['assertionMethod'])).resolves.toEqual({
      didUrl: `${did}#key-2`,
    })
  })

  test("skips a key whose public key on the ledger is not the wallet's (replaced outside this wallet)", async () => {
    const replaced = document(method('#key-1', newKey()), method('#key-2', key2))
    withRecord(replaced, [
      { kmsKeyId: 'kms-1', didDocumentRelativeKeyId: '#key-1' },
      { kmsKeyId: 'kms-2', didDocumentRelativeKeyId: '#key-2' },
    ])

    await expect(selectSigningKey(tenantAgent, replaced, ['assertionMethod'])).resolves.toEqual({
      didUrl: `${did}#key-2`,
    })
  })

  test("skips a key the wallet's record does not have (Credo signs from the record)", async () => {
    withRecord(document(method('#key-2', key2)), [
      { kmsKeyId: 'kms-1', didDocumentRelativeKeyId: '#key-1' },
      { kmsKeyId: 'kms-2', didDocumentRelativeKeyId: '#key-2' },
    ])

    await expect(selectSigningKey(tenantAgent, ledger, ['assertionMethod'])).resolves.toEqual({
      didUrl: `${did}#key-2`,
    })
  })

  test.each([
    ['the wallet holds no key for it', () => delete kms['kms-1'], 'this wallet holds no key for it'],
    ['the KMS key differs', () => (kms['kms-1'] = newKey()), "this wallet's key for it differs from the ledger's"],
  ])('a named key is refused with the reason when %s; no other key is taken', async (_label, change, reason) => {
    change()

    await expect(selectSigningKey(tenantAgent, ledger, ['assertionMethod'], '#key-1')).resolves.toEqual({
      unusable: reason,
    })
  })

  test('without a mapping, the legacy key id of the public key is used, as Credo does', async () => {
    withRecord(ledger, [])
    kms = { [Kms.PublicJwk.fromPublicJwk(key1).legacyKeyId]: key1 }

    await expect(selectSigningKey(tenantAgent, ledger, ['assertionMethod'])).resolves.toEqual({
      didUrl: `${did}#key-1`,
    })
  })

  test('a record without a stored document is compared through the resolved document', async () => {
    withRecord(undefined, [{ kmsKeyId: 'kms-1', didDocumentRelativeKeyId: '#key-1' }])

    await expect(selectSigningKey(tenantAgent, ledger, ['assertionMethod'])).resolves.toEqual({
      didUrl: `${did}#key-1`,
    })
  })

  test('a DID this wallet did not create has no usable key', async () => {
    vi.mocked(tenantAgent.dids.getCreatedDids).mockResolvedValue([])

    await expect(selectSigningKey(tenantAgent, ledger, ['assertionMethod'])).resolves.toEqual({
      unusable: 'the DID was not created in this wallet',
    })
  })

  test('no verification method of the purposes: nothing to select, and nothing looked up', async () => {
    const authenticationOnly = new DidDocument({
      id: did,
      verificationMethod: [method('#verkey', key1)],
      authentication: [`${did}#verkey`],
    })

    await expect(selectSigningKey(tenantAgent, authenticationOnly, ['assertionMethod'])).resolves.toEqual({})
    expect(tenantAgent.dids.getCreatedDids).not.toHaveBeenCalled()
  })
})
