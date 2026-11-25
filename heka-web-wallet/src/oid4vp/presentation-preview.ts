import type { DcqlCredentialsForRequest } from '@credo-ts/core'

import type { ResolvedPresentationRequest } from './present'

// Credo checks the request's signature against the DID or the certificate these prefixes name. A
// redirect_uri request is unsigned: its client id only says where the response goes.
const VERIFIED_CLIENT_ID_PREFIXES: ReadonlySet<string> = new Set([
  'decentralized_identifier',
  'x509_san_dns',
  'x509_hash',
])

export interface PresentationPreview {
  /** The client id Credo resolved for the request's client id prefix. */
  verifier: string
  /** The client id prefix, such as `decentralized_identifier`, `x509_san_dns` or `redirect_uri`. */
  clientIdPrefix: string | null
  /** Whether the prefix binds `verifier` to the request's signature; false for `redirect_uri`. */
  clientIdVerified: boolean
  /** The origin the presentation is posted to (response_uri). */
  responseOrigin: string | null
  /** client_metadata.client_name: chosen by whoever wrote the request, so never shown as the verifier. */
  selfDeclaredName: string | null
  /** The web origin a Digital Credentials API request carries; null for a request opened from a URI. */
  origin: string | null
  credentials: Array<{ name: string; claims: string[] }>
}

function claimNames(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return []
  return Object.keys(payload)
}

function originOf(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

function credentialName(record: { getTags(): object }, fallback: string): string {
  const { vct } = record.getTags() as { vct?: unknown }
  return typeof vct === 'string' && vct.length > 0 ? vct : fallback
}

/**
 * Verifier, where the response goes, credential, and the claims the selected presentation will disclose.
 */
export function describePresentation(
  resolved: Pick<ResolvedPresentationRequest, 'origin' | 'verifier' | 'authorizationRequestPayload'>,
  selectedCredentials: DcqlCredentialsForRequest,
): PresentationPreview {
  const payload = resolved.authorizationRequestPayload as {
    client_id?: unknown
    response_uri?: unknown
    client_metadata?: { client_name?: unknown }
  }
  const clientName = payload.client_metadata?.client_name
  const prefix = resolved.verifier.clientIdPrefix
  // OpenID4VP 1.0's effective client id carries its prefix (decentralized_identifier:did:…), which the
  // preview shows apart.
  const effective = resolved.verifier.effectiveClientId
  const verifier =
    (prefix && effective?.startsWith(`${prefix}:`) ? effective.slice(prefix.length + 1) : effective) ||
    (typeof payload.client_id === 'string' && payload.client_id) ||
    'Unknown verifier'

  const credentials = Object.entries(selectedCredentials).flatMap(([queryId, entries]) =>
    entries.map((entry) => ({
      name: credentialName(entry.credentialRecord, queryId),
      claims: claimNames(entry.disclosedPayload),
    })),
  )

  return {
    verifier,
    clientIdPrefix: prefix || null,
    clientIdVerified: VERIFIED_CLIENT_ID_PREFIXES.has(prefix),
    responseOrigin: originOf(payload.response_uri),
    selfDeclaredName: typeof clientName === 'string' && clientName.length > 0 ? clientName : null,
    origin: resolved.origin && resolved.origin.length > 0 ? resolved.origin : null,
    credentials,
  }
}
