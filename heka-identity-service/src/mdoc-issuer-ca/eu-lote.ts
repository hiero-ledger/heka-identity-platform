import type { LoTEDocument } from '@owf/eudi-lote'

import { EU_LOTE_ISSUER_SERVICE_TYPES } from './eu-service-types'
import { ListIssueInfo } from './eu-trusted-list-parser'

/**
 * Helpers for **ETSI TS 119 602 Lists of Trusted Entities (LoTE)** — the EUDI-era trust lists (PID
 * providers, wallet providers, registrars, pub-EAA providers) and the format the published Heka EU
 * trust list itself uses. Schema/data model come from `@owf/eudi-lote`; this module adds the two
 * pieces that package does not provide yet: compact-JWS **decoding** (consumer side) and granted-anchor
 * **extraction** from a validated document.
 *
 * SECURITY: `decodeLoteJws` performs NO signature verification and `extractLoteAnchors` trusts its
 * input — the caller MUST verify the JWS signature against a pinned signer and schema-validate the
 * payload (`assertValidLoTE`) before trusting anything returned here.
 */

/** JWT `typ` of a signed LoTE (as emitted by `@owf/eudi-lote`'s `signLoTE`). */
export const LOTE_JWT_TYP = 'trustlist+jwt'

export interface DecodedLoteJws {
  header: { alg?: string; typ?: string; kid?: string; x5c?: unknown }
  /** Decoded payload — NOT yet schema-validated. */
  payload: unknown
  /** The exact bytes the signature covers (`base64url(header).base64url(payload)`). */
  signingInput: string
  signature: Uint8Array
}

/** Decode a compact LoTE JWS into its parts. Throws on malformed input; verifies nothing. */
export function decodeLoteJws(jws: string): DecodedLoteJws {
  const parts = jws.trim().split('.')
  if (parts.length !== 3) {
    throw new Error('LoTE document is not a compact JWS (expected three dot-separated parts)')
  }
  const [headerB64, payloadB64, signatureB64] = parts
  const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8')) as DecodedLoteJws['header']
  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as unknown
  return {
    header,
    payload,
    signingInput: `${headerB64}.${payloadB64}`,
    signature: Uint8Array.from(Buffer.from(signatureB64, 'base64url')),
  }
}

/** Read the sequence number, issue time and `NextUpdate` of a schema-validated LoTE document. */
export function readLoteListInfo(document: LoTEDocument): ListIssueInfo {
  const info = document.LoTE.ListAndSchemeInformation
  const parse = (value: unknown): Date | undefined => {
    if (typeof value !== 'string') return undefined
    const time = Date.parse(value)
    return Number.isNaN(time) ? undefined : new Date(time)
  }
  return {
    ...(Number.isInteger(info.LoTESequenceNumber) ? { sequenceNumber: info.LoTESequenceNumber } : {}),
    ...(parse(info.ListIssueDateTime) ? { issuedAt: parse(info.ListIssueDateTime) } : {}),
    ...(parse(info.NextUpdate) ? { nextUpdate: parse(info.NextUpdate) } : {}),
  }
}

export interface ExtractLoteAnchorOptions {
  /**
   * Allow-list of `ServiceTypeIdentifier`s; defaults to {@link EU_LOTE_ISSUER_SERVICE_TYPES} (see
   * `eu-service-types.ts`). Services without a type identifier are excluded; an explicit empty list yields
   * no anchors.
   */
  serviceTypes?: readonly string[]
}

/**
 * A service is active when it carries no `ServiceStatus` at all — the EU LoTE profiles omit the status
 * ("listed is granted", `StatusDeterminationApproach` …/StatusDetn/EU) — or when its status URI ends in
 * `granted` (the TS 119 612 §5.5.4 vocabulary used by generic-profile lists such as Heka's).
 */
function isGrantedOrUnstated(status: string | undefined): boolean {
  if (status === undefined || status.trim() === '') return true
  return status.trim().toLowerCase().endsWith('granted')
}

/**
 * Extract the active (granted, or EU-profile status-less) **credential-issuer** trust-anchor certificates
 * (base64 DER, whitespace-stripped, deduplicated) from a schema-validated LoTE document:
 * `TrustedEntitiesList[] → TrustedEntityServices[] → ServiceInformation →
 * ServiceDigitalIdentity.X509Certificates[].val`, gated on the service type (see
 * {@link ExtractLoteAnchorOptions.serviceTypes}).
 */
export function extractLoteAnchors(document: LoTEDocument, options: ExtractLoteAnchorOptions = {}): string[] {
  const allowedTypes = options.serviceTypes ?? EU_LOTE_ISSUER_SERVICE_TYPES
  const anchors: string[] = []

  for (const entity of document.LoTE.TrustedEntitiesList ?? []) {
    for (const entityService of entity.TrustedEntityServices ?? []) {
      const info = entityService.ServiceInformation
      if (!info) continue
      if (!isGrantedOrUnstated(info.ServiceStatus)) continue
      if (!info.ServiceTypeIdentifier || !allowedTypes.includes(info.ServiceTypeIdentifier.trim())) continue
      for (const certificate of info.ServiceDigitalIdentity?.X509Certificates ?? []) {
        if (typeof certificate.val === 'string' && certificate.val.trim()) {
          anchors.push(certificate.val.replace(/\s+/g, ''))
        }
      }
    }
  }

  return [...new Set(anchors)]
}
