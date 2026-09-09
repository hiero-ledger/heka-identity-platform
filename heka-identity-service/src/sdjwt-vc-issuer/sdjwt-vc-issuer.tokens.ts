/**
 * DI token for resolving {@link SdJwtVcIssuerService} from the OpenID4VCI credential mapper (which runs
 * inside Credo's agent context, outside Nest constructor injection) via `ModuleRef`. Kept in a
 * dependency-free leaf module so `common/agent/agent-modules.provider` can import it without an import
 * cycle — same pattern as `MDOC_ISSUER_CA_SERVICE`.
 */
export const SDJWT_VC_ISSUER_SERVICE = 'SdJwtVcIssuerService'
