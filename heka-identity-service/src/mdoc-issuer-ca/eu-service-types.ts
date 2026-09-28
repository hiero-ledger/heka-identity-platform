/**
 * ETSI **service-type identifiers** relevant to credential-issuer trust, and the hard-coded role gate
 * the EU trust-list consumers apply. Pure constants — safe to import from `config/`.
 *
 * Both EU list formats list *many* kinds of trust services next to the credential issuers: TS 119 612
 * Trusted Lists carry time-stamping authorities, QWAC / QSeal CAs, validation and preservation services;
 * TS 119 602 LoTEs carry wallet providers, registrars and access-certificate (WRPAC) CAs. None of those
 * may ever become an anchor for verifying an mdoc or SD-JWT VC issuer, whatever the operator configures,
 * so the consumers gate on the **issuer types below** and treat the `EU_*_SERVICE_TYPES` variables as an
 * additional *narrowing* only.
 */

const TL_PREFIX = 'http://uri.etsi.org/TrstSvc/Svctype/'
const LOTE_PREFIX = 'http://uri.etsi.org/19602/SvcType/'

/** ETSI TS 119 612 V2.4.1 clause 5.5.1 service types (the subset this service reasons about). */
export const EU_TL_SERVICE_TYPE = {
  /** Qualified-certificate issuing CA (Regulation (EU) No 910/2014) — issues the QEAA/QES seal certificates. */
  caQc: `${TL_PREFIX}CA/QC`,
  /** National root CA issuing root-signing / qualified certificates to supervised TSPs. */
  nationalRootCaQc: `${TL_PREFIX}NationalRootCA-QC`,
  /** Issuance of qualified electronic attestations of attributes (QEAA). */
  eaaQ: `${TL_PREFIX}EAA/Q`,
  /** Issuance of non-qualified electronic attestations of attributes. */
  eaa: `${TL_PREFIX}EAA`,
  /** Issuance of EAAs by or on behalf of a public sector body responsible for an authentic source (PuB-EAA). */
  pubEaa: `${TL_PREFIX}EAA/Pub-EAA`,
  /** Non-issuer examples the gate must exclude. */
  caPkc: `${TL_PREFIX}CA/PKC`,
  tsa: `${TL_PREFIX}TSA`,
  qtst: `${TL_PREFIX}TSA/QTST`,
  eaaValidation: `${TL_PREFIX}EAAValidation`,
} as const

/**
 * TS 119 612 services whose digital identity is a **credential-issuer anchor**: the qualified CAs under
 * which QEAA / QES seal certificates are issued, and the attestation-issuance services themselves. The
 * national root CAs are deliberately excluded (an anchor that wide would trust every service under a
 * Member State's root); operators wanting them can pin them through `TRUST_LIST_PARTNER_CERTIFICATES`.
 */
export const EU_TL_ISSUER_SERVICE_TYPES: readonly string[] = [
  EU_TL_SERVICE_TYPE.caQc,
  EU_TL_SERVICE_TYPE.eaaQ,
  EU_TL_SERVICE_TYPE.pubEaa,
]

/** ETSI TS 119 602 LoTE service types (the EUDI-era vocabulary). */
export const EU_LOTE_SERVICE_TYPE = {
  eaaIssuance: `${LOTE_PREFIX}EAA/Issuance`,
  pidIssuance: `${LOTE_PREFIX}PID/Issuance`,
  pubEaaIssuance: `${LOTE_PREFIX}PubEAA/Issuance`,
  /** Access-certificate (relying-party) CA — never a credential-issuer anchor. */
  wrpacIssuance: `${LOTE_PREFIX}WRPAC/Issuance`,
  /** Registration-certificate CA and wallet-solution provider — never credential-issuer anchors either. */
  wrprcIssuance: `${LOTE_PREFIX}WRPRC/Issuance`,
  walletSolutionIssuance: `${LOTE_PREFIX}WalletSolution/Issuance`,
} as const

/** TS 119 602 services that issue credentials — the same set the wallet's `credential-issuer` role uses. */
export const EU_LOTE_ISSUER_SERVICE_TYPES: readonly string[] = [
  EU_LOTE_SERVICE_TYPE.eaaIssuance,
  EU_LOTE_SERVICE_TYPE.pidIssuance,
  EU_LOTE_SERVICE_TYPE.pubEaaIssuance,
]

/**
 * Apply an operator's optional service-type narrowing to a hard-coded issuer set: empty → the full issuer
 * set; otherwise every configured type must be one of the issuer types (anything else — a TSA, a WRPAC CA
 * — can never be widened in) and the configured subset is used. Throws naming `variable` so the check can
 * run at startup.
 */
export function narrowIssuerServiceTypes(
  configured: readonly string[],
  issuerServiceTypes: readonly string[],
  variable: string,
): string[] {
  const requested = configured.map((value) => value.trim()).filter(Boolean)
  if (requested.length === 0) return [...issuerServiceTypes]
  const unknown = requested.filter((serviceType) => !issuerServiceTypes.includes(serviceType))
  if (unknown.length > 0) {
    throw new Error(
      `${variable} may only narrow the credential-issuer service types (allowed: ${issuerServiceTypes.join(', ')}); ` +
        `not allowed: ${unknown.join(', ')}`,
    )
  }
  return [...new Set(requested)]
}

/** Split a comma-separated environment value into trimmed, non-empty entries. */
export function splitServiceTypeList(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}
