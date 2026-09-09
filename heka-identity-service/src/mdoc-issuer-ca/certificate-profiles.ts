/**
 * mdoc issuer **certificate profiles** — a "credential-type × ecosystem" model.
 *
 * A profile describes the *contents* of the IACA/DSC certificates (validity, EKU, DN shape, policies),
 * independent of the shared IACA→DSC signing *structure* (Layer 1, unchanged). Two profiles ship:
 *
 *   - `MDL_PROFILE`      (mDL × US/AAMVA)  — the shipped ISO 18013-5 / AAMVA mDL profile. Emitted via
 *                                            Credo's typed `X509Api.createCertificate` (unchanged path).
 *   - `EUDI_PID_PROFILE` (PID/EAA × EU)    — the EU/EUDI profile (EN 319 412-1 `organizationIdentifier`
 *                                            DN, optional `certificatePolicies`, no ISO `mdlDS` EKU).
 *                                            Emitted via the `@peculiar/x509` escape hatch (see
 *                                            `eu-certificate-builder.ts`) because Credo's `X509Api`
 *                                            cannot emit those extensions/DN attributes.
 *
 * A future `EU_MDL_PROFILE` (mDL × EU) is the natural third combination: it keeps the ISO `mdlDS` EKU +
 * mDL docType but swaps in the EU DN (`organizationIdentifier`) + `certificatePolicies` — because
 * `mdlDS` is a *credential-type* property (ISO 18013-5 mandates it for any mDL), **not** a US artifact.
 */

/** Credential-type axis: an mDL vs a PID/EAA attestation. */
export type CredentialType = 'mdl' | 'pid-eaa'
/** Ecosystem axis: US/AAMVA vs EU/EUDI trust infrastructure. */
export type Ecosystem = 'us' | 'eu'

// --- OIDs -------------------------------------------------------------------------------------------

/** ISO/IEC 18013-5 §B.1.1 `mdlDS` document-signer extendedKeyUsage. Mandatory on any mDL DSC. */
export const MDL_DOCUMENT_SIGNER_EKU_OID = '1.0.18013.5.1.2'

/** EN 319 412-1 `organizationIdentifier` attribute (subject/issuer RDN), e.g. `VATDE-…`, `NTRDE-…`. */
export const ORGANIZATION_IDENTIFIER_OID = '2.5.4.97'

/**
 * EU/EUDI document-signer EKU OID for PID/EAA attestations.
 *
 * ⚠️ **VERIFY before production use.** The normative ETSI TS 119 472-x / EUDI ARF document-signer EKU for
 * PID/EAA is still stabilizing at time of writing. The
 * shipped `EUDI_PID_PROFILE` therefore **omits** the EKU by default (`dscExtendedKeyUsageOids: undefined`)
 * rather than emit a guessed OID. Set a verified value here (or via config) and switch the profile on once
 * confirmed. The `@peculiar/x509` builder already supports emitting an arbitrary EKU OID.
 */
export const EU_DOCUMENT_SIGNER_EKU_OID_PLACEHOLDER = undefined

// --- Profile shape ----------------------------------------------------------------------------------

export interface CertificateProfile {
  /** Stable identifier, e.g. `'mdl-us'` | `'eudi-pid'`. */
  readonly name: string
  readonly credentialType: CredentialType
  readonly ecosystem: Ecosystem
  readonly iacaValidityDays: number
  readonly dscValidityDays: number
  /**
   * DSC `extendedKeyUsage` OID(s). mDL → `[mdlDS]`; EU PID/EAA → typically dropped (`undefined`) until the
   * normative ETSI EKU is confirmed. `undefined` omits the extension entirely.
   */
  readonly dscExtendedKeyUsageOids?: readonly string[]
  /**
   * `certificatePolicies` OID(s) emitted on the DSC (EU profiles). `undefined` omits the extension; the
   * effective value can also be supplied per-deployment via config (see the builder). The exact ETSI
   * policy OID is deployment/policy-specific — hence configurable rather than hardcoded.
   */
  readonly certificatePolicyOids?: readonly string[]
  /** Whether the IACA/DSC subject/issuer DN carries an EN 319 412-1 `organizationIdentifier` RDN. */
  readonly usesOrganizationIdentifier: boolean
}

// --- Shipped profiles -------------------------------------------------------------------------------

const IACA_VALIDITY_DAYS_MDL = 365 * 5 // ISO 18013-5 / AAMVA cap is ≤9 years
const DSC_VALIDITY_DAYS_MDL = 457 // ISO 18013-5 maximum DSC lifetime

/** mDL × US/AAMVA — the shipped profile. Values mirror the module constants in `mdoc-issuer-ca.service.ts`. */
export const MDL_PROFILE: CertificateProfile = {
  name: 'mdl-us',
  credentialType: 'mdl',
  ecosystem: 'us',
  iacaValidityDays: IACA_VALIDITY_DAYS_MDL,
  dscValidityDays: DSC_VALIDITY_DAYS_MDL,
  dscExtendedKeyUsageOids: [MDL_DOCUMENT_SIGNER_EKU_OID],
  usesOrganizationIdentifier: false,
}

/**
 * PID/EAA × EU/EUDI. High-confidence delta vs mDL: `organizationIdentifier` in the DN + no `mdlDS` EKU.
 * `certificatePolicies` / EKU OIDs are left configurable (see the OID notes) because their normative values
 * are still stabilizing; the builder can emit them when supplied. Validity mirrors ISO for now — the exact
 * ETSI TS 119 472 caps are TBD (VERIFY).
 */
export const EUDI_PID_PROFILE: CertificateProfile = {
  name: 'eudi-pid',
  credentialType: 'pid-eaa',
  ecosystem: 'eu',
  iacaValidityDays: IACA_VALIDITY_DAYS_MDL, // TODO(verify): ETSI TS 119 472 issuer-CA validity
  dscValidityDays: DSC_VALIDITY_DAYS_MDL, // TODO(verify): ETSI TS 119 472 DSC validity
  dscExtendedKeyUsageOids: EU_DOCUMENT_SIGNER_EKU_OID_PLACEHOLDER, // omitted until the ETSI EKU is confirmed
  certificatePolicyOids: undefined, // supply the ETSI policy OID via config when known
  usesOrganizationIdentifier: true,
}

/** Selector accepted by provisioning: a named preset or the explicit two-axis pair. */
export type ProfileSelector =
  | { readonly profile: 'mdl' | 'eudi-pid' }
  | { readonly credentialType: CredentialType; readonly ecosystem: Ecosystem }

const NAMED_PROFILES: Record<string, CertificateProfile> = {
  mdl: MDL_PROFILE,
  'mdl-us': MDL_PROFILE,
  'eudi-pid': EUDI_PID_PROFILE,
  eudi: EUDI_PID_PROFILE,
}

/**
 * Resolve a {@link CertificateProfile} from a selector (named preset or credential-type × ecosystem pair).
 * Defaults to {@link MDL_PROFILE} — the shipped behaviour — when nothing is specified.
 */
export function resolveProfile(selector?: ProfileSelector | string): CertificateProfile {
  if (!selector) return MDL_PROFILE
  if (typeof selector === 'string') return NAMED_PROFILES[selector] ?? MDL_PROFILE
  if ('profile' in selector) return NAMED_PROFILES[selector.profile] ?? MDL_PROFILE

  // Two-axis form: match the shipped presets; extend here when EU_MDL / US-PID presets are added.
  const { credentialType, ecosystem } = selector
  if (credentialType === 'pid-eaa' && ecosystem === 'eu') return EUDI_PID_PROFILE
  if (credentialType === 'mdl' && ecosystem === 'us') return MDL_PROFILE
  // mDL × EU and PID × US are not yet shipped as distinct presets — fall back to the closest by ecosystem.
  return ecosystem === 'eu' ? EUDI_PID_PROFILE : MDL_PROFILE
}
