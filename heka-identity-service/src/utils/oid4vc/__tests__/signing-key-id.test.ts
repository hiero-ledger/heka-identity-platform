import { DidDocument, JsonTransformer } from '@credo-ts/core'

import { signingKeyId } from '..'

const did = 'did:example:123'
const document = (json: Record<string, unknown>) => JsonTransformer.fromJSON({ id: did, ...json }, DidDocument)

describe('signingKeyId', () => {
  test('takes the first verification method that every purpose references, in document order', () => {
    const didDocument = document({
      verificationMethod: [
        { id: `${did}#a`, type: 'Ed25519VerificationKey2020', controller: did },
        { id: `${did}#b`, type: 'Ed25519VerificationKey2020', controller: did },
        { id: `${did}#c`, type: 'Ed25519VerificationKey2020', controller: did },
      ],
      authentication: [`${did}#a`, `${did}#c`],
      // Relative references count too; the order here does not matter
      assertionMethod: ['#c', '#b'],
    })

    expect(signingKeyId(didDocument, ['authentication'])).toBe(`${did}#a`)
    expect(signingKeyId(didDocument, ['assertionMethod'])).toBe(`${did}#b`)
    expect(signingKeyId(didDocument, ['assertionMethod', 'authentication'])).toBe(`${did}#c`)

    // A named key, relative or absolute, is taken only when it has the purposes
    expect(signingKeyId(didDocument, ['assertionMethod'], '#c')).toBe(`${did}#c`)
    expect(signingKeyId(didDocument, ['assertionMethod'], `${did}#c`)).toBe(`${did}#c`)
    expect(signingKeyId(didDocument, ['assertionMethod'], '#a')).toBeUndefined()
  })

  test('finds no key for credentials in a did:indy base document: #verkey is authentication only', () => {
    const didDocument = document({
      verificationMethod: [{ id: `${did}#verkey`, type: 'Ed25519VerificationKey2018', controller: did }],
      authentication: [`${did}#verkey`],
    })

    expect(signingKeyId(didDocument, ['assertionMethod'])).toBeUndefined()
    expect(signingKeyId(didDocument, ['authentication'])).toBe(`${did}#verkey`)
  })
})
