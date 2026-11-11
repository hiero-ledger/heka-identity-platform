import { AriesCredentialFormat } from 'common/types'

import {
  anonCredsOffer,
  dataIntegrityAnonCredsOffer,
  offerMessageRecord,
} from '../../../test/helpers/credential-offer-messages'
import { credentialFormatFromOfferMessage, OFFER_CREDENTIAL_V2_MESSAGE_TAGS } from '../credential-format'

describe('credentialFormatFromOfferMessage', () => {
  test('the offer message tags are the ones Credo stores for an issue-credential v2 offer', () => {
    const tags = offerMessageRecord('exchange-1', [anonCredsOffer]).getTags()

    expect(tags).toMatchObject({ ...OFFER_CREDENTIAL_V2_MESSAGE_TAGS, associatedRecordId: 'exchange-1' })
  })

  test('an anoncreds offer is anoncreds-indy', () => {
    expect(credentialFormatFromOfferMessage(offerMessageRecord('e', [anonCredsOffer]))).toBe(
      AriesCredentialFormat.AnoncredsIndy,
    )
  })

  test('a legacy hlindy offer is anoncreds-indy', () => {
    const legacyOffer = { format: 'hlindy/cred-abstract@v2.0', data: anonCredsOffer.data }

    expect(credentialFormatFromOfferMessage(offerMessageRecord('e', [legacyOffer]))).toBe(
      AriesCredentialFormat.AnoncredsIndy,
    )
  })

  test('a Data Integrity offer bound to an AnonCreds link secret is anoncreds-w3c', () => {
    expect(credentialFormatFromOfferMessage(offerMessageRecord('e', [dataIntegrityAnonCredsOffer]))).toBe(
      AriesCredentialFormat.AnoncredsW3c,
    )
  })

  test('a Data Integrity offer without an AnonCreds link secret binding is unknown', () => {
    const signedAttachmentOnly = {
      format: dataIntegrityAnonCredsOffer.format,
      data: {
        ...dataIntegrityAnonCredsOffer.data,
        binding_method: { didcomm_signed_attachment: { algs_supported: ['EdDSA'], did_methods_supported: ['key'] } },
      },
    }

    expect(credentialFormatFromOfferMessage(offerMessageRecord('e', [signedAttachmentOnly]))).toBeUndefined()
  })

  test('an offer with several different formats, or an unknown one, is unknown', () => {
    expect(
      credentialFormatFromOfferMessage(offerMessageRecord('e', [anonCredsOffer, dataIntegrityAnonCredsOffer])),
    ).toBeUndefined()
    expect(
      credentialFormatFromOfferMessage(
        offerMessageRecord('e', [{ format: 'aries/ld-proof-vc-detail@v1.0', data: {} }]),
      ),
    ).toBeUndefined()
  })

  test('a message that is not an offer is unknown instead of throwing', () => {
    const record = offerMessageRecord('e', [anonCredsOffer])
    record.message = { ...record.message, '@type': 'https://didcomm.org/issue-credential/2.0/request-credential' }

    expect(credentialFormatFromOfferMessage(record)).toBeUndefined()
  })
})
