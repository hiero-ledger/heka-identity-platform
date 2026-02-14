import { AnonCredsSchema } from '@credo-ts/anoncreds/build/models/registry'
import { W3cCredential, W3cCredentialSubject } from '@credo-ts/core'
import { UnprocessableEntityException } from '@nestjs/common'

import { AriesCredentialFormat } from 'common/types'
import { CredentialPreviewAttributeDto } from 'credential/dto'

export interface BuildAriesCredentialProps {
  format: AriesCredentialFormat
  issuerId: string
  credentialDefinitionId: string
  attributes: CredentialPreviewAttributeDto[]
  revocationRegistryDefinitionId?: string
  revocationRegistryIndex?: number
}

export function validateAriesCredAttributes(credOfferAttrNames: string[], schema: AnonCredsSchema) {
  const extraAttrs = credOfferAttrNames.filter((attr) => schema.attrNames.indexOf(attr) === -1)
  if (extraAttrs.length > 0) {
    throw new UnprocessableEntityException(
      `Following attributes not defined by schema are found: ${extraAttrs.join(', ')}`,
    )
  }

  const missedAttrs = schema.attrNames.filter((attr) => credOfferAttrNames.indexOf(attr) === -1)
  if (missedAttrs.length > 0) {
    throw new UnprocessableEntityException(
      `Following attributes defined by schema are missed: ${missedAttrs.join(', ')}`,
    )
  }
}

export const buildAriesCredential = ({
  format,
  issuerId,
  credentialDefinitionId,
  attributes,
  revocationRegistryDefinitionId,
  revocationRegistryIndex,
}: BuildAriesCredentialProps) => {
  switch (format) {
    case AriesCredentialFormat.AnoncredsW3c: {
      const credential = new W3cCredential({
        context: [
          'https://www.w3.org/2018/credentials/v1',
          'https://w3id.org/security/data-integrity/v2',
          {
            '@vocab': 'https://www.w3.org/ns/credentials/issuer-dependent#',
          },
        ],
        type: ['VerifiableCredential'],
        issuer: issuerId,
        issuanceDate: new Date().toISOString(),
        credentialSubject: new W3cCredentialSubject({
          claims: attributes.reduce((obj, attribute) => Object.assign(obj, { [attribute.name]: attribute.value }), {}),
        }),
      })
      return {
        dataIntegrity: {
          bindingRequired: true,
          credential,
          anonCredsLinkSecretBinding: {
            credentialDefinitionId,
            revocationRegistryDefinitionId,
            revocationRegistryIndex,
          },
          didCommSignedAttachmentBinding: {},
        },
      }
    }
    case AriesCredentialFormat.AnoncredsIndy: {
      return {
        anoncreds: {
          credentialDefinitionId,
          attributes,
          revocationRegistryDefinitionId,
          revocationRegistryIndex,
        },
      }
    }
  }
}
