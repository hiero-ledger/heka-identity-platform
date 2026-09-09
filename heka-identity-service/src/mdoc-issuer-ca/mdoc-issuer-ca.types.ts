/**
 * Per-tenant mdoc (ISO 18013-5) issuer PKI. Each tenant is its own issuing authority: a self-signed
 * IACA (the trust anchor) signs short-lived Document Signer Certificates (DSCs), and a DSC signs the
 * Mobile Security Object (MSO) of every issued mdoc. The IACA is distributed to wallets via the Heka
 * trust list (VICAL); the DSC travels in the MSO `x5chain`.
 */

/** A per-tenant IACA — the ISO 18013-5 trust anchor (self-signed CA). One per tenant. */
export interface MdocIaca {
  id: string
  /** KMS key id, re-attached to the parsed certificate so the IACA can sign DSCs. */
  keyId: string
  /** Base64 DER IACA certificate. */
  certificateBase64: string
  /** Hex SHA-256 thumbprint of the IACA certificate. */
  fingerprint: string
  /** Certificate subject/issuer common name. */
  commonName: string
  /** ISO 3166-1 alpha-2 country code carried in the cert subject and the VICAL entry. */
  country: string
  /** Issuing authority name (VICAL `issuingAuthority`); also the cert organizational unit. */
  authorityName: string
  /** Default mdoc docType this IACA is authoritative for (VICAL `docType`), e.g. the mDL docType. */
  docType: string
  /** Certificate profile this IACA was minted under (`'mdl-us'` | `'eudi-pid'`). Absent on legacy records → mDL. */
  profile?: string
  /** EN 319 412-1 `organizationIdentifier` baked into the EU DN; reused verbatim for EU DSC issuance. */
  organizationIdentifier?: string
  createdAt: string
  notAfter: string
}

/** A per-tenant DSC — signs MSOs and chains to the tenant IACA. Short-lived (≤457 days). */
export interface MdocDsc {
  id: string
  /** KMS key id, re-attached to the parsed certificate so Credo signs the MSO with it. */
  keyId: string
  /** Base64 DER DSC certificate (the leaf placed in the MSO `x5chain`). */
  certificateBase64: string
  /** Hex SHA-256 thumbprint of the DSC certificate. */
  fingerprint: string
  /** Id of the IACA record that signed this DSC. */
  iacaId: string
  /** The DSC the mapper signs with. Prior DSCs are retained (already-issued mdocs embed them). */
  isCurrent: boolean
  createdAt: string
  notAfter: string
}

export interface ProvisionIacaOptions {
  /** Certificate subject/issuer common name. Defaults to `<authorityName> mDL IACA`. */
  commonName?: string
  /** ISO 3166-1 alpha-2 country code. Defaults to the service-wide `MDOC_ISSUER_COUNTRY`. */
  country?: string
  /** Issuing authority name. Defaults to the service-wide `MDOC_ISSUER_AUTHORITY`. */
  authorityName?: string
  /** Default mdoc docType. Defaults to the service-wide `MDOC_DEFAULT_DOCTYPE`. */
  docType?: string
  /** IACA validity in days. Defaults to the selected profile's IACA validity. */
  validityDays?: number
  /**
   * Certificate profile: `'mdl'` (default, ISO 18013-5 / AAMVA) or `'eudi-pid'` (EU/EUDI, emitted via the
   * `@peculiar/x509` escape hatch). Defaults to the service-wide `MDOC_ISSUER_PROFILE`.
   */
  profile?: string
  /**
   * EN 319 412-1 `organizationIdentifier` for EU profiles (e.g. `VATDE-0123456789`). Defaults to the
   * service-wide `MDOC_ISSUER_ORGANIZATION_IDENTIFIER`. Required (non-empty) when the profile is EU.
   */
  organizationIdentifier?: string
}
