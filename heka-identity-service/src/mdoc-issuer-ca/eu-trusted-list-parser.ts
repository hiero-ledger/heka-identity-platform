import { XMLParser } from 'fast-xml-parser'

import { EU_TL_ISSUER_SERVICE_TYPES } from './eu-service-types'

/**
 * Parser for **ETSI TS 119 612 trust-status lists**. Both eIDAS document flavours share the same root
 * type (`TrustServiceStatusList`) and digital-identity encoding, so both parse entry points live here:
 *
 *   - {@link parseTrustedListAnchors} — a (national) **Trusted List**: extracts the issuer **trust
 *     anchors** — the `X509Certificate` of each `TSPService` whose status is *granted* **and whose
 *     service type is a credential-issuer type** ({@link EU_TL_ISSUER_SERVICE_TYPES} by default).
 *   - {@link parseLotlPointers} — the EU **List of Trusted Lists** (clause 5.3): extracts each
 *     Member-State pointer — the national TL's location **and the certificate that TL's signature must
 *     match** — the entry point of the eIDAS trust-anchor traversal.
 *
 * Both are **pure XML→data transforms**: neither verifies the document's own XAdES signature — the
 * caller MUST do that (fail-closed) before trusting anything returned here, since an unverified TL
 * could carry attacker-injected anchors and an unverified LoTL could redirect to attacker-controlled
 * national lists / signers.
 *
 * TL services: TS 119 612 clause 5.5; LoTL pointers: clause 5.3.13. Only the `X509Certificate` form of a
 * digital identity yields a usable anchor/signer (`X509SubjectName` / `X509SKI` alone do not carry the
 * full certificate), so those are ignored.
 */

function toArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return []
  return Array.isArray(value) ? value : [value]
}

/** Parse XML into the (namespace-stripped) `TrustServiceStatusList` root, or null when unparseable. */
function parseTslRoot(xml: string): Record<string, unknown> | null {
  if (!xml || !xml.trim()) return null
  const parser = new XMLParser({ removeNSPrefix: true, ignoreAttributes: true, trimValues: true })
  try {
    const document = parser.parse(xml) as Record<string, unknown>
    return (document?.TrustServiceStatusList ?? {}) as Record<string, unknown>
  } catch {
    return null
  }
}

/** Collect the base64 DER `X509Certificate`s (whitespace-stripped) of `ServiceDigitalIdentity` node(s). */
function collectCertificates(identities: unknown[]): string[] {
  const certificates: string[] = []
  for (const identity of identities) {
    for (const digitalId of toArray((identity as Record<string, unknown>)?.DigitalId)) {
      const certificate = (digitalId as Record<string, unknown>)?.X509Certificate
      if (typeof certificate === 'string' && certificate.trim()) {
        certificates.push(certificate.replace(/\s+/g, ''))
      }
    }
  }
  return certificates
}

// --- Trusted List: granted-anchor extraction --------------------------------------------------------

/** A `ServiceStatus` is considered active when its URI ends in `granted` (ETSI TS 119 612 §5.5.4). */
function isGrantedStatus(status: string): boolean {
  return status.trim().toLowerCase().endsWith('granted')
}

export interface ParseTrustedListOptions {
  /**
   * Allow-list of `ServiceTypeIdentifier`s; defaults to {@link EU_TL_ISSUER_SERVICE_TYPES} (see
   * `eu-service-types.ts`). An explicit empty list yields no anchors.
   */
  serviceTypes?: readonly string[]
}

/**
 * Extract the granted **credential-issuer** trust-anchor certificates (base64 DER, whitespace-stripped)
 * from an ETSI TS 119 612 Trusted List XML document. Deduplicated. Returns `[]` for empty/unrecognized
 * input.
 *
 * SECURITY: the returned anchors are only trustworthy if the caller has verified the TL's XAdES
 * signature first. This function performs no signature validation.
 */
export function parseTrustedListAnchors(xml: string, options: ParseTrustedListOptions = {}): string[] {
  const list = parseTslRoot(xml)
  if (!list) return []

  const providerList = (list?.TrustServiceProviderList ?? {}) as Record<string, unknown>
  const providers = toArray(providerList?.TrustServiceProvider)
  const allowedTypes = options.serviceTypes ?? EU_TL_ISSUER_SERVICE_TYPES

  const anchors: string[] = []
  for (const provider of providers) {
    const servicesContainer = (provider as Record<string, unknown>)?.TSPServices as Record<string, unknown>
    const services = toArray(servicesContainer?.TSPService)
    for (const service of services) {
      const info = (service as Record<string, unknown>)?.ServiceInformation as Record<string, unknown>
      if (!info) continue

      const status = String(info.ServiceStatus ?? '')
      if (!isGrantedStatus(status)) continue

      const serviceType = String(info.ServiceTypeIdentifier ?? '').trim()
      if (!allowedTypes.includes(serviceType)) continue

      anchors.push(...collectCertificates(toArray(info.ServiceDigitalIdentity)))
    }
  }

  return [...new Set(anchors)]
}

// --- Trusted List / LoTL: freshness and versioning --------------------------------------------------

/**
 * The scheme-information fields a consumer judges freshness and replay by — TS 119 612 `SchemeInformation`
 * (clause 5.3) and TS 119 602 `ListAndSchemeInformation` alike.
 */
export interface ListIssueInfo {
  /** `TSLSequenceNumber` / `LoTESequenceNumber` — increases with every new issue of the list. */
  sequenceNumber?: number
  /** `ListIssueDateTime`. */
  issuedAt?: Date
  /** `NextUpdate/dateTime` — absent when the list declares none (a closed list carries an empty element). */
  nextUpdate?: Date
}

function parseDateValue(value: unknown): Date | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined
  const time = Date.parse(value)
  return Number.isNaN(time) ? undefined : new Date(time)
}

/**
 * Read the sequence number, issue time and `NextUpdate` of a TL or LoTL. Pure, like the other parsers:
 * meaningful only for a document whose signature the caller verified.
 */
export function parseTrustedListInfo(xml: string): ListIssueInfo {
  const list = parseTslRoot(xml)
  if (!list) return {}
  const scheme = (list?.SchemeInformation ?? {}) as Record<string, unknown>
  const sequence = Number(scheme.TSLSequenceNumber)
  const nextUpdate = scheme.NextUpdate
  const nextUpdateValue =
    nextUpdate !== null && typeof nextUpdate === 'object'
      ? (nextUpdate as Record<string, unknown>).dateTime
      : nextUpdate
  return {
    ...(Number.isInteger(sequence) && sequence >= 0 ? { sequenceNumber: sequence } : {}),
    ...(parseDateValue(scheme.ListIssueDateTime) ? { issuedAt: parseDateValue(scheme.ListIssueDateTime) } : {}),
    ...(parseDateValue(nextUpdateValue) ? { nextUpdate: parseDateValue(nextUpdateValue) } : {}),
  }
}

// --- LoTL: national-TL pointer extraction -----------------------------------------------------------

/** TSLType of a pointer to a Member-State national Trusted List (vs. the LoTL self-pointer / non-EU). */
export const EU_GENERIC_TSL_TYPE = 'http://uri.etsi.org/TrstSvc/TrustedList/TSLType/EUgeneric'

/** One resolved pointer from the LoTL to a (national) Trusted List. */
export interface LotlPointer {
  /** URL of the pointed-to Trusted List XML. */
  location: string
  /** Base64 DER (whitespace-stripped) of the cert(s) the pointed-to TL's XAdES signature must match. */
  expectedSigners: string[]
  /** Member-State territory code (e.g. `DE`), or `''` if absent. */
  schemeTerritory: string
  /** The pointer's `TSLType` URI. */
  tslType: string
}

export interface ParseLotlOptions {
  /**
   * Allow-list of `TSLType` URIs. Defaults to `[EU_GENERIC_TSL_TYPE]` (national TLs only — excludes the
   * LoTL self-pointer and non-EU pointers). Pass `[]` explicitly to include pointers of every type.
   */
  tslTypes?: string[]
  /**
   * Optional Member-State allow-list (e.g. `['DE','FR']`). Empty/omitted = every territory. Pointers with
   * no `SchemeTerritory` are excluded when an allow-list is given.
   */
  schemeTerritories?: string[]
}

/** Read `TSLType` + `SchemeTerritory` out of a pointer's `AdditionalInformation → OtherInformation[]`. */
function readAdditionalInfo(pointer: Record<string, unknown>): { tslType: string; schemeTerritory: string } {
  const additional = pointer?.AdditionalInformation as Record<string, unknown> | undefined
  const others = toArray(additional?.OtherInformation)
  let tslType = ''
  let schemeTerritory = ''
  for (const other of others) {
    if (other && typeof other === 'object') {
      const record = other as Record<string, unknown>
      if (typeof record.TSLType === 'string') tslType = record.TSLType.trim()
      if (record.SchemeTerritory != null) schemeTerritory = String(record.SchemeTerritory).trim()
    }
  }
  return { tslType, schemeTerritory }
}

/**
 * Extract the (national) Trusted-List pointers from a LoTL XML document. Defaults to `EUgeneric`
 * pointers only (national TLs). Returns `[]` for empty/unrecognized input.
 *
 * SECURITY: the returned pointers — including their `expectedSigners` — are only trustworthy if the
 * caller verified the LoTL's own XAdES signature first. This function performs no signature validation.
 */
export function parseLotlPointers(xml: string, options: ParseLotlOptions = {}): LotlPointer[] {
  const list = parseTslRoot(xml)
  if (!list) return []

  const scheme = (list?.SchemeInformation ?? {}) as Record<string, unknown>
  const pointerList = (scheme?.PointersToOtherTSL ?? {}) as Record<string, unknown>
  const pointers = toArray(pointerList?.OtherTSLPointer)

  const allowedTypes = options.tslTypes ?? [EU_GENERIC_TSL_TYPE]
  const allowedTerritories = (options.schemeTerritories ?? []).filter(Boolean)

  const result: LotlPointer[] = []
  for (const raw of pointers) {
    const pointer = raw as Record<string, unknown>
    const location = typeof pointer?.TSLLocation === 'string' ? pointer.TSLLocation.trim() : ''
    if (!location) continue

    const { tslType, schemeTerritory } = readAdditionalInfo(pointer)
    if (allowedTypes.length > 0 && !allowedTypes.includes(tslType)) continue
    if (allowedTerritories.length > 0 && !allowedTerritories.includes(schemeTerritory)) continue

    const identityContainer = pointer?.ServiceDigitalIdentities as Record<string, unknown> | undefined
    // Keep pointers even when no signer is declared — the caller fails such a TL closed (and logs it),
    // which preserves observability rather than silently dropping it here.
    result.push({
      location,
      expectedSigners: collectCertificates(toArray(identityContainer?.ServiceDigitalIdentity)),
      schemeTerritory,
      tslType,
    })
  }
  return result
}
