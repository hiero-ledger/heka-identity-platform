import type { DcqlCredentialsForRequest } from '@credo-ts/core'

import type { ResolvedPresentationRequest } from './present'

export interface PresentationPreview {
  /** The client id Credo resolved and verified for the request's client id prefix. */
  verifier: string
  /** How Credo verified `verifier`: the client id prefix, such as `decentralized_identifier` or `x509_san_dns`. */
  clientIdPrefix: string | null
  /** The origin the presentation is posted to (response_uri). */
  responseOrigin: string | null
  /** client_metadata.client_name: chosen by whoever wrote the request, so never shown as the verifier. */
  selfDeclaredName: string | null
  origin: string
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
    responseOrigin: originOf(payload.response_uri),
    selfDeclaredName: typeof clientName === 'string' && clientName.length > 0 ? clientName : null,
    origin: resolved.origin && resolved.origin.length > 0 ? resolved.origin : 'Origin not provided',
    credentials,
  }
}
