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

/**
 * Returns the credential display entries regardless of the OID4VCI version the issuer uses.
 *
 * OID4VCI 1.0 nests them under `credential_metadata.display`, while draft 14/15 issuers (such as
 * the Heka identity service) put `display` at the top level of the credential configuration.
 * The `@openid4vc/openid4vci` parser only normalizes draft 11 metadata, so the draft 14/15 shape
 * reaches us untouched and has to be handled here.
 */
function getCredentialDisplay(
  credentialMetadata: OpenId4VciCredentialConfigurationSupported
): CredentialMetadataDisplay | undefined {
  if (credentialMetadata.credential_metadata?.display) {
    return credentialMetadata.credential_metadata.display
  }

  const legacyDisplay = (credentialMetadata as { display?: unknown }).display
  return Array.isArray(legacyDisplay) ? (legacyDisplay as CredentialMetadataDisplay) : undefined
}

export function extractOpenId4VcCredentialMetadata(
  credentialMetadata: OpenId4VciCredentialConfigurationSupported,
  serverMetadata: { display?: any[]; id: string }
): OpenId4VcCredentialMetadata {
  return {
    credential: {
      display: getCredentialDisplay(credentialMetadata),
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
