import { DidCommMessageRecord, DidCommOfferCredentialV2Message } from '@credo-ts/didcomm'

import { AriesCredentialFormat } from 'common/types'

/** Attachment format ids of the credential offer, as written by the Credo 0.7 format services */
const ANONCREDS_OFFER_FORMAT = 'anoncreds/credential-offer@v1.0'
const LEGACY_INDY_OFFER_FORMAT = 'hlindy/cred-abstract@v2.0'
const DATA_INTEGRITY_OFFER_FORMAT = 'didcomm/w3c-di-vc-offer@v0.1'

/** Tags of the stored issue-credential v2 offer message (`DidCommMessageRecord.getTags`) */
export const OFFER_CREDENTIAL_V2_MESSAGE_TAGS = {
  protocolName: DidCommOfferCredentialV2Message.type.protocolName,
  protocolMajorVersion: String(DidCommOfferCredentialV2Message.type.protocolMajorVersion),
  messageName: DidCommOfferCredentialV2Message.type.messageName,
}

const isAnonCredsBoundDataIntegrityOffer = (offer: DidCommOfferCredentialV2Message, attachmentId: string): boolean => {
  const data = offer.getOfferAttachmentById(attachmentId)?.getDataAsJson<{
    binding_method?: { anoncreds_link_secret?: unknown }
  }>()
  return !!data?.binding_method?.anoncreds_link_secret
}

/**
 * The DIDComm credential format of an exchange, derived from its stored v2 offer message:
 * the offer's `formats` say which attachment format was offered (Credo issues exactly that format).
 * A Data Integrity offer is `anoncreds-w3c` only when it binds the credential to an AnonCreds link secret;
 * other Data Integrity credentials, several formats in one offer, or anything unreadable give `undefined`.
 */
export const credentialFormatFromOfferMessage = (
  messageRecord: DidCommMessageRecord,
): AriesCredentialFormat | undefined => {
  try {
    const offer = messageRecord.getMessageInstance(DidCommOfferCredentialV2Message)
    const formats = new Set(
      (offer.formats ?? []).map(({ format, attachmentId }) => {
        switch (format) {
          case ANONCREDS_OFFER_FORMAT:
          case LEGACY_INDY_OFFER_FORMAT:
            return AriesCredentialFormat.AnoncredsIndy
          case DATA_INTEGRITY_OFFER_FORMAT:
            return isAnonCredsBoundDataIntegrityOffer(offer, attachmentId)
              ? AriesCredentialFormat.AnoncredsW3c
              : undefined
          default:
            return undefined
        }
      }),
    )
    return formats.size === 1 ? [...formats][0] : undefined
  } catch {
    return undefined
  }
}
