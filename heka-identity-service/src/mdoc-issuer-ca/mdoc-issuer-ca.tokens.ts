/**
 * DI token for resolving {@link MdocIssuerCaService} outside Nest's constructor injection — the
 * OpenID4VCI credential mapper runs inside Credo's agent context and reaches the service lazily via
 * `ModuleRef`. Kept in a dependency-free leaf module so `common/agent/agent-modules.provider` can
 * import it without creating an import cycle (the service imports `common/agent`).
 */
export const MDOC_ISSUER_CA_SERVICE = 'MdocIssuerCaService'

/**
 * DI token for {@link VerifierTrustAnchorService}: Credo's X.509 module resolves it lazily via `ModuleRef`
 * from the `getTrustedCertificatesForVerification` hook (same cycle-avoidance as above).
 */
export const VERIFIER_TRUST_ANCHOR_SERVICE = 'VerifierTrustAnchorService'
