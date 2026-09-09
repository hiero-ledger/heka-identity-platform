import type { AgentContext, JsonObject, X509Certificate } from '@credo-ts/core'

import { ClaimFormat, SdJwtVcPayload, W3cCredential, W3cCredentialSubject, w3cDate } from '@credo-ts/core'
import {
  OpenId4VciCredentialFormatProfile,
  OpenId4VciCredentialRequestToCredentialMapper,
  OpenId4VciSignCredentials,
} from '@credo-ts/openid4vc'
import { v4 } from 'uuid'

/**
 * SD-JWT VC issuer modes: `did` (default) signs with the issuer DID; `x5c` signs with the per-tenant
 * X.509 issuer cert (HAIP) and sets `iss` to the configured https issuer URL. Single source of truth
 * for the DTO validation, the offer service, and the credential mapper.
 */
export const ISSUER_MODES = ['did', 'x5c'] as const
export type IssuerMode = (typeof ISSUER_MODES)[number]

export interface CredentialMapperDependencies {
  /**
   * Resolve the per-tenant mdoc Document Signer Certificate (DSC) for the issuing tenant, with its
   * KMS keyId attached so Credo signs the MSO with it. Supplied by `agent-modules.provider`, which
   * resolves `MdocIssuerCaService` per request (the mapper runs inside Credo's agent context). Throws
   * a 400 when the tenant has no provisioned mdoc issuer.
   */
  getMdocIssuerCertificate: (agentContext: AgentContext) => Promise<X509Certificate>
  /**
   * Resolve the per-tenant SD-JWT VC **x5c** issuer cert chain ([leaf, service-root]) + the `iss` URL
   * (`https://<domain>`, host matching the leaf SAN). Supplied by `agent-modules.provider`, which
   * resolves `SdJwtVcIssuerService` per request. Only invoked when a credential opts into `x5c`
   * issuance; throws a 400 when no issuer domain is configured.
   */
  getSdJwtVcIssuerCertificate: (
    agentContext: AgentContext,
  ) => Promise<{ certificateChain: X509Certificate[]; issuerUrl: string }>
}

export interface CredentialIssuanceMetadata {
  format: string
  type: string | string[]
  credentialSupportedId: string
  /** SD-JWT VC issuer mode — see {@link ISSUER_MODES}. */
  issuerMode?: IssuerMode
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

export const createCredentialRequestToCredentialMapper =
  ({
    getMdocIssuerCertificate,
    getSdJwtVcIssuerCertificate,
  }: CredentialMapperDependencies): OpenId4VciCredentialRequestToCredentialMapper =>
  async ({
    agentContext,
    issuanceSession,
    holderBinding,
    credentialConfigurationId,
  }): Promise<OpenId4VciSignCredentials> => {
    const credentials = issuanceSession.issuanceMetadata?.credentials as CredentialIssuanceMetadata[]
    if (!credentials) throw new Error('Not implemented')

    const issuanceMetadata = credentials.find(
      (credential) => credential.credentialSupportedId === credentialConfigurationId,
    )

    if (!issuanceMetadata) throw new Error(`Credential not found for id: ${credentialConfigurationId}`)

    const verificationMethod = issuanceMetadata.issuer.didUrl

    if (issuanceMetadata.format === OpenId4VciCredentialFormatProfile.MsoMdoc) {
      if (!issuanceMetadata.namespaces) throw new Error(`Invalid credential issuance metadata: 'namespaces' is missing`)

      // Sign the MSO with the issuing tenant's own Document Signer Certificate (per-tenant IACA→DSC),
      // not a shared global certificate. Throws a 400 when the tenant has no provisioned mdoc issuer.
      const issuerCertificate = await getMdocIssuerCertificate(agentContext)
      const holderKey = holderBinding.keys[0]?.jwk
      if (!holderKey) throw new Error('No holder key found for mdoc binding')

      const validUntil = new Date()

      // TODO: Implement actual validity period & VC refresh logic
      validUntil.setFullYear(validUntil.getFullYear() + 1)

      return {
        type: 'credentials' as const,
        format: ClaimFormat.MsoMdoc,
        credentials: [
          {
            docType: issuanceMetadata.type as string,
            namespaces: issuanceMetadata.namespaces,
            validityInfo: { validUntil },
            issuerCertificate,
            holderKey,
          },
        ],
      }
    }

    if (issuanceMetadata.format === OpenId4VciCredentialFormatProfile.SdJwtVc) {
      if (!issuanceMetadata.payload) throw new Error(`Invalid credential issuance metadata: 'payload' is missing`)

      const vct = Array.isArray(issuanceMetadata.type) ? issuanceMetadata.type[0] : issuanceMetadata.type

      // Opt-in HAIP x5c issuer (per-credential): sign with the tenant's X.509 issuer cert + iss=https URL.
      // Default stays DID-based.
      let sdJwtVcIssuer: { method: 'did'; didUrl: string } | { method: 'x5c'; x5c: X509Certificate[]; issuer: string }
      if (issuanceMetadata.issuerMode === 'x5c') {
        const { certificateChain, issuerUrl } = await getSdJwtVcIssuerCertificate(agentContext)
        sdJwtVcIssuer = { method: 'x5c', x5c: certificateChain, issuer: issuerUrl }
      } else {
        if (!verificationMethod) throw new Error(`Invalid credential issuance metadata: 'didUrl' is missing`)
        sdJwtVcIssuer = { method: 'did', didUrl: verificationMethod }
      }

      return {
        type: 'credentials' as const,
        format: ClaimFormat.SdJwtDc,
        credentials: holderBinding.keys.map((binding) => ({
          holder: binding,
          issuer: sdJwtVcIssuer,
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
        type: 'credentials' as const,
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
        type: 'credentials' as const,
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
        type: 'credentials' as const,
        format: ClaimFormat.LdpVc,
        credentials: [{ credential, verificationMethod }],
      }
    }

    throw new Error('Not implemented')
  }
