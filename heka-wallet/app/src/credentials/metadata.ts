import type {
  OpenId4VciCredentialConfigurationSupported,
  OpenId4VciCredentialIssuerMetadataDisplay,
} from '@credo-ts/openid4vc'

import { CredentialRecord } from './types'

type CredentialMetadataDisplay = NonNullable<
  NonNullable<OpenId4VciCredentialConfigurationSupported['credential_metadata']>['display']
>

export interface OpenId4VcCredentialMetadata {
  credential: {
    display?: CredentialMetadataDisplay
    order?: OpenId4VciCredentialConfigurationSupported['order']
  }
  issuer: {
    display?: OpenId4VciCredentialIssuerMetadataDisplay[]
    id: string
  }
}

const OID4VC_CREDENTIAL_METADATA_KEY = '_heka-wallet/openId4VcCredentialMetadata'

export function extractOpenId4VcCredentialMetadata(
  credentialMetadata: OpenId4VciCredentialConfigurationSupported,
  serverMetadata: { display?: any[]; id: string }
): OpenId4VcCredentialMetadata {
  return {
    credential: {
      display: credentialMetadata.credential_metadata?.display,
      order: credentialMetadata.order,
    },
    issuer: {
      display: serverMetadata.display,
      id: serverMetadata.id,
    },
  }
}

/**
 * Gets the OpenId4Vc credential metadata from the given W3C credential record.
 */
export function getOpenId4VcCredentialMetadata(credentialRecord: CredentialRecord): OpenId4VcCredentialMetadata | null {
  return credentialRecord.metadata.get(OID4VC_CREDENTIAL_METADATA_KEY)
}

/**
 * Sets the OpenId4Vc credential metadata on the given W3cCredentialRecord or SdJwtVcRecord.
 *
 * NOTE: this does not save the record.
 */
export function setOpenId4VcCredentialMetadata(
  credentialRecord: CredentialRecord,
  metadata: OpenId4VcCredentialMetadata
) {
  credentialRecord.metadata.set(OID4VC_CREDENTIAL_METADATA_KEY, metadata)
}
