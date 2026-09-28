/**
 * Trust-source configuration: the N signed trust lists (ETSI TS 119 602 LoTE JWTs) the wallet learns
 * trust anchors from — one loader per list, each pinned to its own signer certificates, each vouching
 * only for the attestation types it is classified for, plus configuration-supplied static anchors for the
 * attestation types no source classifies. The Heka scheme lists are ordinary sources here: no source is
 * privileged by code.
 */

import { validateCertificate } from './certificateConfig'

/**
 * What a source's anchors are used for (see `resolveTrustAnchors`): `credential-issuer` anchors verify
 * credential signatures; `access-certificate-authority` anchors verify relying-party access certificates (WRPAC =
 * wallet-relying-party access certificate, ETSI TS 119 602 service type `WRPAC/Issuance`) — the chains
 * of signed requests and signed issuer metadata.
 */
export type TrustRole = 'credential-issuer' | 'access-certificate-authority'

export const TRUST_ROLES: readonly TrustRole[] = ['credential-issuer', 'access-certificate-authority']

export interface TrustClassification {
  /** mdoc docTypes this source may vouch for (e.g. `eu.europa.ec.eudi.pid.1`). */
  docTypes?: string[]
  /** SD-JWT VC `vct` values this source may vouch for (e.g. `urn:eudi:pid:1`). */
  vcts?: string[]
}

export interface TrustSourceConfig {
  /** Stable id; keys the learned anchors in the trust anchor store. */
  id: string
  role: TrustRole
  /** Location of the LoTE JWT. */
  url: string
  /** Certificates (base64 DER) the list signer's `x5c` chain must terminate at. Empty = source is skipped. */
  pinnedSigners: string[]
  /**
   * Attestation types this source may vouch for. Absent = unrestricted (any type of its role that no
   * other source classifies). A classified type is trusted ONLY through the sources classifying it.
   */
  classification?: TrustClassification
  /** Follow the list's in-spec `PointersToOtherLoTE` one level, pinned to each pointer's signer certs. */
  followPointers?: boolean
}

/** The `react-native-config` values the source list is derived from. */
export interface TrustSourceEnv {
  /** JSON array of {@link TrustSourceConfig}; when set it replaces the defaults entirely. */
  TRUST_SOURCES?: string
  /** Base URL of the Heka identity service; seeds the default scheme-list sources. */
  AGENCY_PROVIDER_URL?: string
  /** Heka service root CA (base64 DER); pins the default sources' list signer. */
  HEKA_SERVICE_ROOT_CERTIFICATE?: string
}

export const HEKA_EAA_PROVIDERS_SOURCE_ID = 'heka-eaa-providers'
export const HEKA_WRPAC_PROVIDERS_SOURCE_ID = 'heka-wrpac-providers'

/**
 * The default sources: the Heka scheme lists published by the identity service
 * (`GET /trust-list/eaa-providers` — credential issuers; `GET /trust-list/wrpac-providers` —
 * access-certificate authorities), both pinned to the configured service root. No agency URL = no sources.
 */
export function defaultTrustSources(
  env: Pick<TrustSourceEnv, 'AGENCY_PROVIDER_URL' | 'HEKA_SERVICE_ROOT_CERTIFICATE'>
): TrustSourceConfig[] {
  if (!env.AGENCY_PROVIDER_URL) return []
  const base = env.AGENCY_PROVIDER_URL.replace(/\/+$/, '')
  const pinnedSigners = env.HEKA_SERVICE_ROOT_CERTIFICATE?.trim()
    ? [validateCertificate(env.HEKA_SERVICE_ROOT_CERTIFICATE, 'HEKA_SERVICE_ROOT_CERTIFICATE')]
    : []
  return [
    {
      id: HEKA_EAA_PROVIDERS_SOURCE_ID,
      role: 'credential-issuer',
      url: `${base}/trust-list/eaa-providers`,
      pinnedSigners,
    },
    {
      id: HEKA_WRPAC_PROVIDERS_SOURCE_ID,
      role: 'access-certificate-authority',
      url: `${base}/trust-list/wrpac-providers`,
      pinnedSigners,
    },
  ]
}

/** Resolve the configured sources: explicit `TRUST_SOURCES` JSON, else the Heka defaults. */
export function trustSourcesFromConfig(env: TrustSourceEnv): TrustSourceConfig[] {
  if (env.TRUST_SOURCES && env.TRUST_SOURCES.trim() !== '') return parseTrustSources(env.TRUST_SOURCES)
  return defaultTrustSources(env)
}

/** Parse + validate a `TRUST_SOURCES` JSON array. Throws a descriptive error on any invalid entry. */
export function parseTrustSources(raw: string): TrustSourceConfig[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new Error(`TRUST_SOURCES is not valid JSON: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    })
  }
  if (!Array.isArray(parsed)) throw new Error('TRUST_SOURCES must be a JSON array')

  const seen = new Set<string>()
  return parsed.map((entry, index) => {
    const source = validateTrustSource(entry, index)
    if (seen.has(source.id)) throw new Error(`TRUST_SOURCES[${index}]: duplicate id "${source.id}"`)
    seen.add(source.id)
    return source
  })
}

function validateTrustSource(entry: unknown, index: number): TrustSourceConfig {
  const at = `TRUST_SOURCES[${index}]`
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) throw new Error(`${at}: must be an object`)
  const record = entry as Record<string, unknown>

  const id = nonEmptyString(record.id, `${at}.id`)
  const role = record.role
  if (typeof role !== 'string' || !TRUST_ROLES.includes(role as TrustRole)) {
    throw new Error(`${at}.role: must be one of ${TRUST_ROLES.join(', ')}`)
  }
  const url = nonEmptyString(record.url, `${at}.url`)
  if (!/^https?:\/\//i.test(url)) throw new Error(`${at}.url: must be an http(s) URL`)

  if (!Array.isArray(record.pinnedSigners) || record.pinnedSigners.length === 0) {
    throw new Error(`${at}.pinnedSigners: must be a non-empty array of base64 DER certificates`)
  }
  const pinnedSigners = record.pinnedSigners.map((certificate, i) =>
    validateCertificate(nonEmptyString(certificate, `${at}.pinnedSigners[${i}]`), `${at}.pinnedSigners[${i}]`)
  )

  const source: TrustSourceConfig = { id, role: role as TrustRole, url, pinnedSigners }

  if (record.classification !== undefined) {
    const classification = record.classification
    if (typeof classification !== 'object' || classification === null || Array.isArray(classification)) {
      throw new Error(`${at}.classification: must be an object`)
    }
    const { docTypes, vcts } = classification as Record<string, unknown>
    source.classification = {
      ...(docTypes !== undefined ? { docTypes: stringArray(docTypes, `${at}.classification.docTypes`) } : {}),
      ...(vcts !== undefined ? { vcts: stringArray(vcts, `${at}.classification.vcts`) } : {}),
    }
  }
  if (record.followPointers !== undefined) {
    if (typeof record.followPointers !== 'boolean') throw new Error(`${at}.followPointers: must be a boolean`)
    source.followPointers = record.followPointers
  }
  return source
}

function nonEmptyString(value: unknown, at: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${at}: must be a non-empty string`)
  return value.trim()
}

function stringArray(value: unknown, at: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${at}: must be an array of strings`)
  return value.map((item, i) => nonEmptyString(item, `${at}[${i}]`))
}
