import type { JsonObject } from '@credo-ts/core/build/types'

import { ClaimFormat, SdJwtVcPayload, W3cCredential, W3cCredentialSubject, w3cDate } from '@credo-ts/core'
import { OpenId4VciCredentialFormatProfile, OpenId4VciCredentialRequestToCredentialMapper } from '@credo-ts/openid4vc'
import { OpenId4VciSignCredentials } from '@credo-ts/openid4vc/build/openid4vc-issuer/OpenId4VcIssuerServiceOptions'
import { v4 } from 'uuid'

export interface CredentialIssuanceMetadata {
  format: string
  type: string | string[]
  credentialSupportedId: string
  issuer: {
    did: string
    didUrl: string
    image?: string
    name?: string
    url?: string
  }
  '@context'?: Array<string | JsonObject>
  credentialStatus?: {
    location: string
    index: number
  }
  credentialSubject?: Record<string, unknown>
  payload?: SdJwtVcPayload
  disclosureFrame?: {
    _sd?: string[]
  }
}

export const credentialRequestToCredentialMapper: OpenId4VciCredentialRequestToCredentialMapper = ({
  issuanceSession,
  holderBinding,
  credentialConfigurationId,
}): OpenId4VciSignCredentials => {
  const credentials = issuanceSession.issuanceMetadata?.credentials as CredentialIssuanceMetadata[]
  if (!credentials) throw new Error('Not implemented')

  const issuanceMetadata = credentials.find(
    (credential) => credential.credentialSupportedId == credentialConfigurationId,
  )

  if (!issuanceMetadata) throw new Error(`Credential not found for id: ${credentialConfigurationId}`)

  // const credentialSupportedId = issuanceMetadata.credentialSupportedId
  const verificationMethod = issuanceMetadata.issuer.didUrl

  // let credentialStatus
  // if (issuanceMetadata.credentialStatus) {
  //   credentialStatus = new BitstringCredentialStatus({
  //     id: `${issuanceMetadata.credentialStatus.location}#${issuanceMetadata.credentialStatus.index}`,
  //     type: 'BitstringStatusListEntry',
  //     // @ts-ignore
  //     statusPurpose: 'revocation',
  //     statusListIndex: issuanceMetadata.credentialStatus.index.toString(),
  //     statusListCredential: issuanceMetadata.credentialStatus.location,
  //   })
  // }

  if (issuanceMetadata.format === OpenId4VciCredentialFormatProfile.SdJwtVc) {
    if (!issuanceMetadata.payload) throw new Error(`Invalid credential issuance metadata: 'payload' is missing`)

    return {
      format: ClaimFormat.SdJwtVc,
      credentials: holderBinding.keys.map((binding) => ({
        holder: binding,
        issuer: {
          method: 'did',
          didUrl: verificationMethod,
        },
        payload: {
          vct: issuanceMetadata.type,
          ...issuanceMetadata.payload,
        },
        disclosureFrame: issuanceMetadata.disclosureFrame,
        hashingAlgorithm: 'sha-256',
      })),
    }
  }

  const holderDidBinding = holderBinding.keys.find((binding) => binding.method === 'did')
  const holderDid = holderDidBinding?.didUrl.split('#')[0]

  const baseCredential = {
    type: issuanceMetadata.type as string[],
    issuer: {
      id: issuanceMetadata.issuer.did,
      name: issuanceMetadata.issuer.name,
      image: issuanceMetadata.issuer.image,
      url: issuanceMetadata.issuer.url,
    },
    credentialSubject: new W3cCredentialSubject({
      id: holderDid,
      claims: issuanceMetadata.credentialSubject,
    }),
    // credentialStatus,
    issuanceDate: w3cDate(Date.now()),
  }

  if (issuanceMetadata.format === OpenId4VciCredentialFormatProfile.JwtVcJson) {
    const credential = new W3cCredential(baseCredential)
    return {
      format: ClaimFormat.JwtVc,
      credentials: [{ credential, verificationMethod }],
    }
  }

  if (issuanceMetadata.format === OpenId4VciCredentialFormatProfile.JwtVcJsonLd) {
    const credential = new W3cCredential({
      context: issuanceMetadata['@context'],
      ...baseCredential,
    })
    return {
      format: ClaimFormat.JwtVc,
      credentials: [{ credential, verificationMethod }],
    }
  }

  if (issuanceMetadata.format === OpenId4VciCredentialFormatProfile.LdpVc) {
    const credential = new W3cCredential({
      id: `urn:${v4()}`,
      context: issuanceMetadata['@context'],
      expirationDate: w3cDate(Date.now() + 1000 * 60 * 60 * 24 * 365),
      ...baseCredential,
    })
    return {
      format: ClaimFormat.LdpVc,
      credentials: [{ credential, verificationMethod }],
    }
  }

  throw new Error('Not implemented')
}
