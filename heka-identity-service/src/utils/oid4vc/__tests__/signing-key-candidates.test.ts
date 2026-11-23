import { DidDocument, JsonTransformer } from '@credo-ts/core'

import { signingKeyCandidates } from '..'

const did = 'did:example:123'
const document = (json: Record<string, unknown>) => JsonTransformer.fromJSON({ id: did, ...json }, DidDocument)

describe('signingKeyCandidates', () => {
  test('lists the verification methods that every purpose references, in document order', () => {
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

    expect(signingKeyCandidates(didDocument, ['authentication'])).toEqual([`${did}#a`, `${did}#c`])
    expect(signingKeyCandidates(didDocument, ['assertionMethod'])).toEqual([`${did}#b`, `${did}#c`])
    expect(signingKeyCandidates(didDocument, ['assertionMethod', 'authentication'])).toEqual([`${did}#c`])

    // A named key, relative or absolute, is listed only when it has the purposes
    expect(signingKeyCandidates(didDocument, ['assertionMethod'], '#c')).toEqual([`${did}#c`])
    expect(signingKeyCandidates(didDocument, ['assertionMethod'], `${did}#c`)).toEqual([`${did}#c`])
    expect(signingKeyCandidates(didDocument, ['assertionMethod'], '#a')).toEqual([])
  })

  test('lists no key for credentials in a did:indy base document: #verkey is authentication only', () => {
    const didDocument = document({
      verificationMethod: [{ id: `${did}#verkey`, type: 'Ed25519VerificationKey2018', controller: did }],
      authentication: [`${did}#verkey`],
    })

    expect(signingKeyCandidates(didDocument, ['assertionMethod'])).toEqual([])
    expect(signingKeyCandidates(didDocument, ['authentication'])).toEqual([`${did}#verkey`])
  })
})
