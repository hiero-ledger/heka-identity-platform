import type { AgentContext, JsonObject } from '@credo-ts/core'

import {
  ClaimFormat,
  Kms,
  SdJwtVcPayload,
  W3cCredential,
  W3cCredentialSubject,
  w3cDate,
  X509Certificate,
} from '@credo-ts/core'
import {
  OpenId4VciCredentialFormatProfile,
  OpenId4VciCredentialRequestToCredentialMapper,
  OpenId4VciSignCredentials,
} from '@credo-ts/openid4vc'
import { v4 } from 'uuid'

/** SD-JWT VC issuer modes: `did` (default) or `x5c`; documented on the offer DTO's `issuerMode`. */
export const ISSUER_MODES = ['did', 'x5c'] as const
export type IssuerMode = (typeof ISSUER_MODES)[number]

/**
 * Tenant services the mapper needs; supplied by `buildCredentialMapperDependencies` through `ModuleRef`
 * because the mapper is built before those Nest providers exist.
 */
export interface CredentialMapperDependencies {
  /** The tenant's current mdoc DSC with its KMS key bound (400 if no mdoc issuer is provisioned). */
  getMdocIssuerCertificate: (agentContext: AgentContext) => Promise<X509Certificate>
  /** The tenant's SD-JWT VC x5c chain `[leaf, service-root]` + `iss` URL (400 if no issuer domain is configured). */
  getSdJwtVcIssuerCertificate: (
    agentContext: AgentContext,
  ) => Promise<{ certificateChain: X509Certificate[]; issuerUrl: string }>
}

/**
 * The SD-JWT VC `status.status_list` claim (draft-ietf-oauth-status-list) for the credential at `position`
 * of the issuance: entry `indexes[position]` (a batch reserves one entry per holder binding key at offer
 * time — two credentials must never share an entry, or revoking one revokes the other). Throws when the
 * batch is larger than what was reserved.
 */
export function tokenStatusListClaim(
  credentialStatus: CredentialIssuanceMetadata['credentialStatus'],
  position = 0,
): { status: { status_list: { idx: number; uri: string } } } | Record<string, never> {
  if (credentialStatus?.type !== 'token-status-list') return {}
  const indexes = credentialStatus.indexes ?? [credentialStatus.index]
  const idx = indexes[position]
  if (idx === undefined) {
    throw new Error(
      `Batch issuance requested credential ${position + 1} but only ${indexes.length} status-list entr${
        indexes.length === 1 ? 'y was' : 'ies were'
      } reserved at offer time`,
    )
  }
  return { status: { status_list: { idx, uri: credentialStatus.location } } }
}

/** The x5c signing identity pinned to an SD-JWT VC issuance at offer time. */
export interface PinnedIssuerSigner {
  /** KMS key id of the leaf's private key (tenant store). */
  keyId: string
  /** `[leaf, …, root]` as base64 DER. */
  x5c: string[]
  /** The credential `iss` (`https://<issuer domain>`). */
  issuer: string
}

/**
 * Rebuild the pinned chain with the leaf's key bound. A key that no longer exists fails the request: the
 * offer must be re-created, never silently signed with another identity.
 */
async function pinnedIssuerChain(agentContext: AgentContext, signer: PinnedIssuerSigner): Promise<X509Certificate[]> {
  const kms = agentContext.resolve(Kms.KeyManagementApi)
  const key = await kms.getPublicKey({ keyId: signer.keyId })
  if (!key) {
    throw new Error(
      `The SD-JWT VC issuer key pinned at offer time (${signer.keyId}) no longer exists in the tenant key store; create a new offer`,
    )
  }
  const chain = signer.x5c.map((certificate) => X509Certificate.fromEncodedCertificate(certificate))
  chain[0].keyId = signer.keyId
  return chain
}

export interface CredentialIssuanceMetadata {
  format: string
  type: string | string[]
  credentialSupportedId: string
  /** SD-JWT VC issuer mode — see {@link ISSUER_MODES}. */
  issuerMode?: IssuerMode
  /**
   * x5c mode: the chain + KMS key the status-list entry was allocated under, pinned at offer time so a
   * certificate renewal before the credential request does not split the credential from its list.
   * Absent → the current chain is used.
   */
  issuerSigner?: PinnedIssuerSigner
  issuer: {
    did?: string
    didUrl?: string
    image?: string
    name?: string
    url?: string
  }
  '@context'?: Array<string | JsonObject>
  /**
   * Revocation reference: `bitstring` = W3C bitstring list (W3C VCs); `token-status-list` = IETF token
   * status list, carried by SD-JWT VCs as `status.status_list`. Older persisted sessions lack `type`
   * (→ `bitstring`) and `indexes`.
   */
  credentialStatus?: {
    type?: 'bitstring' | 'token-status-list'
    location: string
    /** Entry of the first credential of the issuance (the only one for W3C VCs). */
    index: number
    /** One entry per credential of a batch issuance — `indexes[i]` belongs to holder binding key `i`. */
    indexes?: number[]
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

      let sdJwtVcIssuer: { method: 'did'; didUrl: string } | { method: 'x5c'; x5c: X509Certificate[]; issuer: string }
      if (issuanceMetadata.issuerMode === 'x5c') {
        if (issuanceMetadata.issuerSigner) {
          const signer = issuanceMetadata.issuerSigner
          sdJwtVcIssuer = { method: 'x5c', x5c: await pinnedIssuerChain(agentContext, signer), issuer: signer.issuer }
        } else {
          // No pin stored: the current chain.
          const { certificateChain, issuerUrl } = await getSdJwtVcIssuerCertificate(agentContext)
          sdJwtVcIssuer = { method: 'x5c', x5c: certificateChain, issuer: issuerUrl }
        }
      } else {
        if (!verificationMethod) throw new Error(`Invalid credential issuance metadata: 'didUrl' is missing`)
        sdJwtVcIssuer = { method: 'did', didUrl: verificationMethod }
      }

      return {
        type: 'credentials' as const,
        format: ClaimFormat.SdJwtDc,
        credentials: holderBinding.keys.map((binding, position) => ({
          holder: binding,
          issuer: sdJwtVcIssuer,
          payload: {
            vct,
            ...issuanceMetadata.payload,
            ...tokenStatusListClaim(issuanceMetadata.credentialStatus, position),
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
