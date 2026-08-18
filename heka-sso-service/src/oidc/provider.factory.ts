import { OidcConfig } from '@config'
import Provider, { Configuration } from 'oidc-provider'

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
 * OP core (INTEGRATION.md Phase 1, PR 1): builds the `node-oidc-provider`
 * instance from validated config and the persisted signing JWKS. Runs on the
 * library's built-in in-memory adapter until the MikroORM adapter PR replaces
 * it. Clients and protocol policy (PKCE/client auth/clockTolerance) land in
 * OP core PR 2.
 */
export function createOidcProvider(config: OidcConfig, jwks: { keys: Record<string, any>[] }): Provider {
  const provider = new Provider(config.issuerUrl, {
    jwks: jwks as Configuration['jwks'],
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
