/**
 * mdoc issuer **certificate profiles** — a "credential-type × ecosystem" model.
 *
 * A profile describes the *contents* of the IACA/DSC certificates (validity, EKU, DN shape, policies,
 * qcStatements, AIA), independent of the shared IACA→DSC signing *structure* (Layer 1, unchanged).
 * Four profiles ship:
 *
 *   - `MDL_PROFILE`      (mDL × US/AAMVA)  — the shipped ISO 18013-5 / AAMVA mDL profile. Emitted via
 *                                            Credo's typed `X509Api.createCertificate` (unchanged path).
 *   - `EU_MDL_PROFILE`   (mDL × EU)        — ISO `mdlDS` EKU + mDL docType (ISO 18013-5 mandates both for
 *                                            any mDL) with the EU DN, policies and AIA.
 *   - `EUDI_PID_PROFILE` (PID × EU)        — ETSI TS 119 412-6 clause 4 "PID Provider sign/seal certificate".
 *   - `EUDI_EAA_PROFILE` (EAA × EU)        — ETSI TS 119 412-6 clause 6 "EAA Provider attribute sign/seal
 *                                            certificate" (non-qualified).
 *
 * The EU profiles are emitted via the `@peculiar/x509` escape hatch (see `eu-certificate-builder.ts`)
 * because Credo's `X509Api` cannot emit those extensions / DN attributes.
 *
 * ## Conformance — ETSI TS 119 412-6 V1.1.1 (2025-09), the version referenced by CIR (EU) 2026/1731
 *
 * Re-checked 2026-09-10 against the published text (E1.1). V1.2.1 (2026-04) only clarifies the same
 * requirements (key-usage types A/B/C/F; AIA "as specified in EN 319 412-2 §4.4.1"; QcType "at least").
 *
 * | Requirement | What it demands | Where it is satisfied |
 * |---|---|---|
 * | PID-4.1-01 | fields per EN 319 412-2, amended here | builder + this profile |
 * | PID-4.1-02 | extensions non-critical unless allowed | builder: only keyUsage / basicConstraints critical |
 * | PID-4.2-01 | issuer per EN 319 412-2 §4.2.3, or = subject if self-signed | IACA DN = DSC issuer DN |
 * | PID-4.3-02 | legal-person subject per EN 319 412-3 §4.2.1 | DN = C, O, organizationIdentifier, CN |
 * | PID-4.4.1-01/02 | key usage per EN 319 412-3 §4.3.1 (Type A ok; C allowed for ISO 18013-5) | DSC keyUsage = digitalSignature, critical |
 * | PID-4.4.2-01 | Subject Key Identifier present (RFC 5280 §4.2.1.2) | builder SKI |
 * | PID-4.4.3-01..03 | CA-issued cert: AIA with id-ad-caIssuers http(s) location | `requiresAuthorityInformationAccess` → `GET /mdoc-issuers/certificates/:fingerprint` |
 * | PID-4.5-01 | qcStatements with QcType `id-etsi-qct-pid` | `dscQcTypes` |
 * | EN 319 412-2 §4.3.3 (via PID-4.1-01) | certificatePolicies present (TSP-defined OID) | `requiresCertificatePolicies` → `MDOC_ISSUER_CERTIFICATE_POLICY_OID` |
 * | EAA-6.1-02 | EN 319 412-3 profile for legal persons | `EUDI_EAA_PROFILE` (no QcType) |
 * | QEA-7 / PSB-8 | qualified sign/seal certificates issued by a QTSP, QcPSB statement | **out of scope** — never self-provisioned (E4 CSR path) |
 *
 * No clause of TS 119 412-6 or TS 119 472-1 caps the certificate validity; the ISO 18013-5 caps are
 * kept as the conservative default for every profile. TS 119 412-6 defines no extendedKeyUsage for
 * PID / EAA certificates, so the EU PID / EAA profiles emit none; Credo's mdoc verification does not
 * require the ISO `mdlDS` EKU either.
 */

/** Credential-type axis: an mDL vs a PID vs a (non-qualified) EAA. */
export type CredentialType = 'mdl' | 'pid' | 'eaa'
/** Ecosystem axis: US/AAMVA vs EU/EUDI trust infrastructure. */
export type Ecosystem = 'us' | 'eu'

// --- OIDs -------------------------------------------------------------------------------------------

/** ISO/IEC 18013-5 §B.1.1 `mdlDS` document-signer extendedKeyUsage. Mandatory on any mDL DSC. */
export const MDL_DOCUMENT_SIGNER_EKU_OID = '1.0.18013.5.1.2'

/** EN 319 412-1 `organizationIdentifier` attribute (subject/issuer RDN), e.g. `VATDE-…`, `NTRDE-…`. */
export const ORGANIZATION_IDENTIFIER_OID = '2.5.4.97'

/** RFC 3739 §3.2.6 / EN 319 412-5 `qcStatements` extension (id-pe-qcStatements). */
export const ID_PE_QC_STATEMENTS_OID = '1.3.6.1.5.5.7.1.3'

/** EN 319 412-5 §4.2.3 `QcType` statement (id-etsi-qcs-QcType, esi4-qcStatement-6). */
export const ID_ETSI_QCS_QC_TYPE_OID = '0.4.0.1862.1.6'

/** TS 119 412-6 Annex A `id-etsi-qct-pid` — QcType of a PID Provider sign/seal certificate (PID-4.5-01). */
export const ID_ETSI_QCT_PID_OID = '0.4.0.194126.1.1'

/** TS 119 412-6 Annex A `id-etsi-qct-wal` — QcType of a Wallet Provider sign/seal certificate (WAL-5.2-01). */
export const ID_ETSI_QCT_WAL_OID = '0.4.0.194126.1.2'

// --- Profile shape ----------------------------------------------------------------------------------

export interface ExtendedKeyUsageProfile {
  readonly oids: readonly string[]
  /** ISO 18013-5 marks `mdlDS` critical; ETSI profiles keep every non-mandated extension non-critical. */
  readonly critical: boolean
}

export interface CertificateProfile {
  /** Stable identifier, e.g. `'mdl-us'` | `'mdl-eu'` | `'eudi-pid'` | `'eudi-eaa'`. */
  readonly name: string
  readonly credentialType: CredentialType
  readonly ecosystem: Ecosystem
  /** Subject-CN label: `<authority> <label> IACA` / `<authority> <label> DSC`. */
  readonly credentialLabel: string
  readonly iacaValidityDays: number
  readonly dscValidityDays: number
  /** DSC `extendedKeyUsage`. mDL → `mdlDS` (critical); EU PID / EAA → none. `undefined` omits the extension. */
  readonly dscExtendedKeyUsage?: ExtendedKeyUsageProfile
  /**
   * EN 319 412-2 §4.3.3 / EN 319 412-3 §4.3.2: `certificatePolicies` shall be present on EU end-entity
   * certificates with a TSP-defined policy OID — supplied per deployment (`MDOC_ISSUER_CERTIFICATE_POLICY_OID`
   * or the provisioning option); provisioning fails without it when this is set.
   */
  readonly requiresCertificatePolicies: boolean
  /** QcType values of the DSC `qcStatements` (TS 119 412-6 PID-4.5-01). `undefined` omits the extension. */
  readonly dscQcTypes?: readonly string[]
  /**
   * TS 119 412-6 PID-4.4.3-01 / EN 319 412-2 §4.4.1: a CA-issued end-entity certificate carries an AIA
   * `caIssuers` location of its issuing CA certificate — the public IACA download route.
   */
  readonly requiresAuthorityInformationAccess: boolean
  /** Whether the IACA/DSC subject/issuer DN carries an EN 319 412-1 `organizationIdentifier` RDN. */
  readonly usesOrganizationIdentifier: boolean
}

// --- Shipped profiles -------------------------------------------------------------------------------

const IACA_VALIDITY_DAYS = 365 * 5 // ISO 18013-5 / AAMVA cap is ≤9 years; no ETSI cap (see header)
const DSC_VALIDITY_DAYS = 457 // ISO 18013-5 maximum DSC lifetime; no ETSI cap (see header)

/** mDL × US/AAMVA — the shipped profile. Values mirror the module constants in `mdoc-issuer-ca.service.ts`. */
export const MDL_PROFILE: CertificateProfile = {
  name: 'mdl-us',
  credentialType: 'mdl',
  ecosystem: 'us',
  credentialLabel: 'mDL',
  iacaValidityDays: IACA_VALIDITY_DAYS,
  dscValidityDays: DSC_VALIDITY_DAYS,
  dscExtendedKeyUsage: { oids: [MDL_DOCUMENT_SIGNER_EKU_OID], critical: true },
  requiresCertificatePolicies: false,
  requiresAuthorityInformationAccess: false,
  usesOrganizationIdentifier: false,
}

/**
 * mDL × EU/EUDI. The ISO 18013-5 credential-type properties (`mdlDS` EKU, critical) with the EU
 * ecosystem properties (EN 319 412-3 legal-person DN, certificatePolicies, AIA). No QcType: an mDL is
 * not a PID; qualified (QEAA / PuB-EAA) mDL seals come from a QTSP, not from this CA.
 */
export const EU_MDL_PROFILE: CertificateProfile = {
  name: 'mdl-eu',
  credentialType: 'mdl',
  ecosystem: 'eu',
  credentialLabel: 'mDL',
  iacaValidityDays: IACA_VALIDITY_DAYS,
  dscValidityDays: DSC_VALIDITY_DAYS,
  dscExtendedKeyUsage: { oids: [MDL_DOCUMENT_SIGNER_EKU_OID], critical: true },
  requiresCertificatePolicies: true,
  requiresAuthorityInformationAccess: true,
  usesOrganizationIdentifier: true,
}

/** PID × EU/EUDI — TS 119 412-6 clause 4 (see the conformance table in the header). */
export const EUDI_PID_PROFILE: CertificateProfile = {
  name: 'eudi-pid',
  credentialType: 'pid',
  ecosystem: 'eu',
  credentialLabel: 'PID',
  iacaValidityDays: IACA_VALIDITY_DAYS,
  dscValidityDays: DSC_VALIDITY_DAYS,
  dscExtendedKeyUsage: undefined, // TS 119 412-6 defines none for PID certificates
  requiresCertificatePolicies: true,
  dscQcTypes: [ID_ETSI_QCT_PID_OID],
  requiresAuthorityInformationAccess: true,
  usesOrganizationIdentifier: true,
}

/** (Non-qualified) EAA × EU/EUDI — TS 119 412-6 clause 6: EN 319 412-3 legal-person profile, no QcType. */
export const EUDI_EAA_PROFILE: CertificateProfile = {
  name: 'eudi-eaa',
  credentialType: 'eaa',
  ecosystem: 'eu',
  credentialLabel: 'EAA',
  iacaValidityDays: IACA_VALIDITY_DAYS,
  dscValidityDays: DSC_VALIDITY_DAYS,
  dscExtendedKeyUsage: undefined,
  requiresCertificatePolicies: true,
  requiresAuthorityInformationAccess: true,
  usesOrganizationIdentifier: true,
}

/** Named presets accepted by provisioning / `MDOC_ISSUER_PROFILE`. */
export type ProfileName = 'mdl' | 'mdl-us' | 'mdl-eu' | 'eudi' | 'eudi-pid' | 'eudi-eaa'

/** Selector accepted by provisioning: a named preset or the explicit two-axis pair. */
export type ProfileSelector =
  | { readonly profile: ProfileName }
  | { readonly credentialType: CredentialType | 'pid-eaa'; readonly ecosystem: Ecosystem }

const NAMED_PROFILES: Record<ProfileName, CertificateProfile> = {
  mdl: MDL_PROFILE,
  'mdl-us': MDL_PROFILE,
  'mdl-eu': EU_MDL_PROFILE,
  'eudi-pid': EUDI_PID_PROFILE,
  eudi: EUDI_PID_PROFILE,
  'eudi-eaa': EUDI_EAA_PROFILE,
}

export const PROFILE_NAMES: readonly ProfileName[] = Object.keys(NAMED_PROFILES) as ProfileName[]

/**
 * Resolve a {@link CertificateProfile} from a selector (named preset or credential-type × ecosystem pair).
 * Defaults to {@link MDL_PROFILE} — the shipped behaviour — when nothing is specified.
 */
export function resolveProfile(selector?: ProfileSelector | string): CertificateProfile {
  if (!selector) return MDL_PROFILE
  if (typeof selector === 'string') return NAMED_PROFILES[selector as ProfileName] ?? MDL_PROFILE
  if ('profile' in selector) return NAMED_PROFILES[selector.profile] ?? MDL_PROFILE

  const { credentialType, ecosystem } = selector
  if (ecosystem === 'eu') {
    if (credentialType === 'mdl') return EU_MDL_PROFILE
    if (credentialType === 'eaa') return EUDI_EAA_PROFILE
    return EUDI_PID_PROFILE // 'pid' and the legacy 'pid-eaa' alias
  }
  // No US PID / EAA ecosystem profile exists — the shipped mDL profile is the closest.
  return MDL_PROFILE
}
