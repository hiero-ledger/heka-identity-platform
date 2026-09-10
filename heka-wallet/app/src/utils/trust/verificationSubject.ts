import { Mdoc } from '@credo-ts/core'

import { CredentialFormat, TrustSubject } from './trustResolver'

/** Structural subset of Credo's `X509VerificationContext['verification']` the wallet branches on. */
export type X509VerificationContext = { type: string; credential?: unknown }

/**
 * Map a Credo X509 verification context to a trust subject:
 *  - a signed OpenID4VP authorization request or signed OpenID4VCI issuer metadata is verified against
 *    **access-certificate** anchors (the WRPAC-shaped chain: request-signer / access-cert leaves);
 *  - a credential is verified against **credential-issuer** anchors, gated by its format + type;
 *  - anything else (key / client attestations — never verified by a holder) → `undefined`, i.e. the
 *    caller falls back to Credo's global `trustedCertificates`.
 */
export function trustSubjectFor(verification: X509VerificationContext): TrustSubject | undefined {
  switch (verification.type) {
    case 'oauth2SecuredAuthorizationRequest':
    case 'openId4VciCredentialIssuerMetadata':
      return { role: 'access-certificate' }
    case 'credential':
      return { role: 'credential-issuer', ...credentialFormat(verification.credential) }
    default:
      return undefined
  }
}

function credentialFormat(credential: unknown): { format: CredentialFormat; credentialType?: string } {
  if (credential instanceof Mdoc) return { format: 'mso_mdoc', credentialType: credential.docType }
  const sdJwt = credential as { compact?: unknown; payload?: { vct?: unknown } } | null | undefined
  if (typeof sdJwt?.compact === 'string' && typeof sdJwt.payload?.vct === 'string') {
    return { format: 'dc+sd-jwt', credentialType: sdJwt.payload.vct }
  }
  return { format: 'other' }
}
