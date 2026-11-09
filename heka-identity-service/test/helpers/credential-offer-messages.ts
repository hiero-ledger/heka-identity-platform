import { JsonEncoder } from '@credo-ts/core'
import {
  DidCommAttachment,
  DidCommAttachmentData,
  DidCommCredentialFormatSpec,
  DidCommCredentialV2Preview,
  DidCommMessageRecord,
  DidCommMessageRole,
  DidCommOfferCredentialV2Message,
} from '@credo-ts/didcomm'

export interface OfferAttachment {
  format: string
  data: Record<string, unknown>
}

/** A stored offer message, built with Credo's own classes the way the v2 protocol saves it */
export const offerMessageRecord = (associatedRecordId: string, attachments: OfferAttachment[]) => {
  const offer = new DidCommOfferCredentialV2Message({
    credentialPreview: new DidCommCredentialV2Preview({ attributes: [] }),
    formats: attachments.map(
      ({ format }, index) => new DidCommCredentialFormatSpec({ format, attachmentId: `attachment-${index}` }),
    ),
    offerAttachments: attachments.map(
      ({ data }, index) =>
        new DidCommAttachment({
          id: `attachment-${index}`,
          mimeType: 'application/json',
          data: new DidCommAttachmentData({ base64: JsonEncoder.toBase64(data) }),
        }),
    ),
  })
  return new DidCommMessageRecord({ message: offer.toJSON(), role: DidCommMessageRole.Sender, associatedRecordId })
}

export const anonCredsOffer: OfferAttachment = {
  format: 'anoncreds/credential-offer@v1.0',
  data: { schema_id: 'schema-1', cred_def_id: 'creddef-1', nonce: '1', key_correctness_proof: {} },
}

export const dataIntegrityAnonCredsOffer: OfferAttachment = {
  format: 'didcomm/w3c-di-vc-offer@v0.1',
  data: {
    data_model_versions_supported: ['1.1'],
    binding_required: true,
    binding_method: { anoncreds_link_secret: { cred_def_id: 'creddef-1', nonce: '1', key_correctness_proof: {} } },
    credential: { type: ['VerifiableCredential'] },
  },
}
