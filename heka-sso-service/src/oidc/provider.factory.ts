import { OidcClientConfig, OidcConfig } from '@config'
import Provider, { ClientMetadata, Configuration } from 'oidc-provider'

import { ClaimSet } from './claims.util'

/** DI token for the configured `oidc-provider` instance. */
export const OIDC_PROVIDER = 'OIDC_PROVIDER'

/** Minimal contract of `AccountClaimsStore` the provider needs for `findAccount` (P1.4). */
export interface AccountClaimsResolver {
  get(sub: string): ClaimSet | undefined
}

/**
 * The claim names this deployment can release (P1.4): the union of every login
 * configuration's mapped claim names and static claims, plus the pipeline's
 * own claims (`login_config_id`, `vc_presented_attributes` — §1 step 3) and
 * `amr`. All are attached to the `openid` scope: brokering IdPs request
 * `scope=openid` (Keycloak's default) and Auth0 never calls userinfo, so
 * everything must be available in the id_token (§1 step 4). Standalone
 * `claim: null` entries would only be requestable via the claims parameter,
 * which brokers do not send.
 */
const openidScopeClaims = (config: OidcConfig): string[] => {
  const names = new Set<string>(['sub', 'amr', 'login_config_id', 'vc_presented_attributes'])
  for (const loginConfig of config.loginConfigs) {
    for (const claimName of Object.values(loginConfig.claimMapping)) names.add(claimName)
    for (const claimName of Object.keys(loginConfig.staticClaims ?? {})) names.add(claimName)
  }
  return [...names].sort()
}

/**
 * Escapes a value for safe interpolation into the error page markup.
 */
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`)

/**
 * Minimal branded error page (Phase 1 — the wallet-login interaction PR owns
 * the real UI). Never leaks stack traces; `out` carries only the OAuth error
 * fields the library deems safe to show.
 */
const renderError: NonNullable<Configuration['renderError']> = async (ctx, out) => {
  ctx.type = 'html'
  ctx.body = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Sign-in error</title></head>
<body>
<h1>Sign-in error</h1>
<p>The sign-in request could not be processed.</p>
<dl>
${Object.entries(out)
  .map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(String(value))}</dd>`)
  .join('\n')}
</dl>
</body>
</html>`
}

/**
 * Maps a validated static client config onto the provider's client metadata.
 * `login_config_id` rides along as extra metadata (declared below via
 * `extraClientMetadata`) for the interaction layer to resolve the login
 * configuration per client.
 */
const toClientMetadata = (client: OidcClientConfig): ClientMetadata => ({
  client_id: client.clientId,
  client_secret: client.clientSecret,
  redirect_uris: client.redirectUris,
  grant_types: client.grantTypes,
  response_types: client.responseTypes as ClientMetadata['response_types'],
  token_endpoint_auth_method: client.tokenEndpointAuthMethod as ClientMetadata['token_endpoint_auth_method'],
  ...(client.postLogoutRedirectUris !== undefined && { post_logout_redirect_uris: client.postLogoutRedirectUris }),
  ...(client.loginConfigId !== undefined && { login_config_id: client.loginConfigId }),
})

/**
 * OP core (INTEGRATION.md Phase 1, PR 1 + PR 2): builds the `node-oidc-provider`
 * instance from validated config and the persisted signing JWKS — static
 * clients from `OIDC_CLIENTS` and the protocol policy targeting the IdP-broker
 * common denominator (authorization code + PKCE S256 only, secret-based client
 * auth, clock-skew slack for Keycloak's 0s default). Runs on the library's
 * built-in in-memory adapter until the MikroORM adapter PR replaces it.
 *
 * `accountClaims` (P1.4) resolves the claim set the interaction stored under
 * the computed `sub` (§4.4 — there is no user table); when omitted (some unit
 * tests), the library's default sub-only `findAccount` applies.
 */
export function createOidcProvider(
  config: OidcConfig,
  jwks: { keys: Record<string, any>[] },
  accountClaims?: AccountClaimsResolver,
): Provider {
  const provider = new Provider(config.issuerUrl, {
    jwks: jwks as Configuration['jwks'],
    clients: config.clients.map(toClientMetadata),
    // findAccount over the stored claim set (P1.4): `accountId` *is* the
    // computed `sub`; an unknown `sub` (e.g. the in-memory store died with a
    // restart) resolves to no account and the flow fails cleanly instead of
    // minting an identity from nothing.
    ...(accountClaims && {
      findAccount: (_ctx, sub) => {
        const claims = accountClaims.get(sub)
        if (!claims) return undefined
        return {
          accountId: sub,
          claims: () => ({ ...claims, sub }),
        }
      },
    }),
    extraClientMetadata: {
      properties: ['login_config_id'],
    },
    // Authorization code flow only — no implicit/hybrid (broker matrix, INTEGRATION.md §1).
    responseTypes: ['code'],
    // The IdP-broker floor (Cognito/Entra): secret-based auth via header or body.
    clientAuthMethods: ['client_secret_basic', 'client_secret_post'],
    // PKCE (S256 — the only method the library supports) is mandatory for all
    // clients; the library default exempts confidential clients.
    pkce: {
      required: () => false,
    },
    clockTolerance: config.clockTolerance,
    // The library default set plus everything this deployment can release
    // under the `openid` scope (see `openidScopeClaims`).
    claims: {
      acr: null,
      sid: null,
      auth_time: null,
      iss: null,
      openid: openidScopeClaims(config),
    },
    cookies: {
      keys: config.cookieKeys,
    },
    ttl: {
      AccessToken: config.ttl.accessToken,
      AuthorizationCode: config.ttl.authorizationCode,
      IdToken: config.ttl.idToken,
      Interaction: config.ttl.interaction,
      Session: config.ttl.session,
      Grant: config.ttl.grant,
    },
    features: {
      devInteractions: { enabled: false },
    },
    // Defaults, made explicit where the integration docs reference the paths
    // (the userinfo default would otherwise be `/me`).
    routes: {
      authorization: '/authorize',
      token: '/token',
      jwks: '/jwks',
      userinfo: '/userinfo',
    },
    renderError,
  })

  // TLS terminates at the reverse proxy — trust X-Forwarded-* (INTEGRATION.md §1).
  provider.proxy = true

  return provider
}
