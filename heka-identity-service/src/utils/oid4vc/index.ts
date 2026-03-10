import type { JsonObject } from '@credo-ts/core'

import { ClaimFormat, SdJwtVcPayload, W3cCredential, W3cCredentialSubject, X509Certificate, w3cDate } from '@credo-ts/core'
import {
  OpenId4VciCredentialFormatProfile,
  OpenId4VciCredentialRequestToCredentialMapper,
  OpenId4VciSignCredentials,
} from '@credo-ts/openid4vc'
import { v4 } from 'uuid'

export interface CredentialIssuanceMetadata {
  format: string
  type: string | string[]
  credentialSupportedId: string
  issuer: {
    did?: string
    didUrl?: string
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
  namespaces?: Record<string, Record<string, unknown>>
}

export const createCredentialRequestToCredentialMapper = (
  mdlIssuerCertificate?: string,
): OpenId4VciCredentialRequestToCredentialMapper =>
  ({ issuanceSession, holderBinding, credentialConfigurationId }): OpenId4VciSignCredentials => {
    const credentials = issuanceSession.issuanceMetadata?.credentials as CredentialIssuanceMetadata[]
    if (!credentials) throw new Error('Not implemented')

    const issuanceMetadata = credentials.find(
      (credential) => credential.credentialSupportedId == credentialConfigurationId,
    )

    if (!issuanceMetadata) throw new Error(`Credential not found for id: ${credentialConfigurationId}`)

    const verificationMethod = issuanceMetadata.issuer.didUrl

    if (issuanceMetadata.format === OpenId4VciCredentialFormatProfile.MsoMdoc) {
      if (!mdlIssuerCertificate) throw new Error('MDL_ISSUER_CERTIFICATE is not configured')
      if (!issuanceMetadata.namespaces) throw new Error(`Invalid credential issuance metadata: 'namespaces' is missing`)

      const issuerCertificate = X509Certificate.fromEncodedCertificate(mdlIssuerCertificate)
      const holderKey = holderBinding.keys[0]?.jwk
      if (!holderKey) throw new Error('No holder key found for mdoc binding')

      return {
        format: ClaimFormat.MsoMdoc,
        credentials: [
          {
            docType: issuanceMetadata.type as string,
            namespaces: issuanceMetadata.namespaces,
            issuerCertificate,
            holderKey,
          },
        ],
      }
    }

    if (issuanceMetadata.format === OpenId4VciCredentialFormatProfile.SdJwtVc) {
      if (!issuanceMetadata.payload) throw new Error(`Invalid credential issuance metadata: 'payload' is missing`)
      if (!verificationMethod) throw new Error(`Invalid credential issuance metadata: 'didUrl' is missing`)

      const vct = Array.isArray(issuanceMetadata.type) ? issuanceMetadata.type[0] : issuanceMetadata.type

      return {
        format: ClaimFormat.SdJwtVc,
        credentials: holderBinding.keys.map((binding) => ({
          holder: binding,
          issuer: {
            method: 'did',
            didUrl: verificationMethod,
          },
          payload: {
            vct,
            ...issuanceMetadata.payload,
          },
          disclosureFrame: issuanceMetadata.disclosureFrame,
          hashingAlgorithm: 'sha-256',
        })),
      }
    }

    if (!issuanceMetadata.issuer.did) throw new Error(`Invalid credential issuance metadata: 'issuer.did' is missing`)
    if (!verificationMethod) throw new Error(`Invalid credential issuance metadata: 'issuer.didUrl' is missing`)

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

// Keep backward-compatible export for any direct usages
export const credentialRequestToCredentialMapper = createCredentialRequestToCredentialMapper()
