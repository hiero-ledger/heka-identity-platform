/**
 * The wallet's **static** trust anchors — configuration-supplied certificate sets that apply next to
 * the anchors learned from the trust sources (for credential types no source classifies, see
 * `composeTrustedCertificates`). Nothing is bundled in code: both sets are empty unless configured. Every
 * entry must be a well-formed X.509 certificate; an invalid entry throws, and `loadTrustConfiguration`
 * turns that into a logged startup error (see `certificateConfig.ts`).
 */
export interface StaticAnchorEnv {
  /**
   * mdoc **issuer** anchors (IACA / issuer certificates, base64 DER; comma-separated, PEM accepted).
   * Only needed for an issuer that publishes no trust list — tenant issuers are learned from the Heka
   * scheme list.
   */
  TRUSTED_MDOC_ISSUER_CERTIFICATES?: string
  /**
   * OpenID4VP request-signer anchors: the verifier's request-signing **leaf** for the `x509_hash`
   * trust model or its **CA** for `x509_san_dns` (base64 DER; comma-separated, PEM accepted).
   */
  TRUSTED_REQUEST_SIGNER_CERTIFICATES?: string
}

export interface StaticAnchors {
  mdocIssuers: string[]
  requestSigners: string[]
  /**
   * The Heka service root CA (`HEKA_SERVICE_ROOT_CERTIFICATE`, zero or one entry): chain root of the SD-JWT VC
   * `x5c` issuer leaves and of the request-signing / access-certificate leaves. Never an mdoc issuer anchor.
   */
  serviceRoots: string[]
}
