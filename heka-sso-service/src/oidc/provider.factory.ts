import { OidcClientConfig, OidcConfig } from '@config'
import Provider, { ClientMetadata, Configuration } from 'oidc-provider'

/** DI token for the configured `oidc-provider` instance. */
export const OIDC_PROVIDER = 'OIDC_PROVIDER'

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
  ...(client.loginConfigId !== undefined && { login_config_id: client.loginConfigId }),
})

/**
 * OP core (INTEGRATION.md Phase 1, PR 1 + PR 2): builds the `node-oidc-provider`
 * instance from validated config and the persisted signing JWKS — static
 * clients from `OIDC_CLIENTS` and the protocol policy targeting the IdP-broker
 * common denominator (authorization code + PKCE S256 only, secret-based client
 * auth, clock-skew slack for Keycloak's 0s default). Runs on the library's
 * built-in in-memory adapter until the MikroORM adapter PR replaces it.
 */
export function createOidcProvider(config: OidcConfig, jwks: { keys: Record<string, any>[] }): Provider {
  const provider = new Provider(config.issuerUrl, {
    jwks: jwks as Configuration['jwks'],
    clients: config.clients.map(toClientMetadata),
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
