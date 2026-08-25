import { OidcClientConfig, OidcConfig } from '@config'
import { Logger } from '@nestjs/common'
import Provider, { ClientMetadata, Configuration, interactionPolicy } from 'oidc-provider'

import { ClaimSet } from './claims.util'
import { renderPage } from './pages'

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
 * Error page (P2.10.1: pixels live in `pages/error.html`). Never leaks stack
 * traces; `out` carries only the OAuth error fields the library deems safe to
 * show.
 */
const renderError: NonNullable<Configuration['renderError']> = async (ctx, out) => {
  ctx.type = 'html'
  ctx.body = renderPage('error.html', {
    details: Object.entries(out)
      .map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(String(value))}</dd>`)
      .join('\n'),
  })
}

/**
 * Interaction policy = the library default plus one login check: when the
 * session claims an `accountId` whose claim set is no longer resolvable —
 * the store is in-memory (P1.3/P1.5), so a restart wipes it while provider
 * sessions persist in Postgres for up to a day — a fresh wallet login is
 * required. Without this check the no-interaction fast path crashes: an
 * unresolvable account skips grant loading and the consent checks then
 * dereference the missing grant (`server_error` / "oops! something went
 * wrong" on every login until the browser's session cookie dies).
 */
const buildInteractionPolicy = (accountClaims: AccountClaimsResolver) => {
  const policy = interactionPolicy.base()
  policy.get('login')!.checks.add(
    new interactionPolicy.Check('claims_unresolvable', 'session account claims are no longer resolvable', (ctx) => {
      const accountId = ctx.oidc.session?.accountId
      if (accountId && !accountClaims.get(accountId)) return interactionPolicy.Check.REQUEST_PROMPT
      return interactionPolicy.Check.NO_NEED_TO_PROMPT
    }),
  )
  return policy
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
  // P2.5: back-channel logout receiver; session_required puts `sid` into
  // id_tokens and logout_tokens so the receiver can match the exact session.
  ...(client.backchannelLogoutUri !== undefined && {
    backchannel_logout_uri: client.backchannelLogoutUri,
    backchannel_logout_session_required: client.backchannelLogoutSessionRequired ?? true,
  }),
  ...(client.loginConfigId !== undefined && { login_config_id: client.loginConfigId }),
})

/**
 * RP-initiated logout confirmation page (P2.5.1; pixels live in
 * `pages/logout-confirm.html` / `pages/logout-auto.html` since P2.10.1). The
 * pre-built `form` argument must be embedded verbatim — it carries the XSRF
 * secret — and the confirm button submits `name="logout"`.
 *
 * The confirmation dialog is shown by default on every request. With
 * `OIDC_LOGOUT_AUTO_CONFIRM=true`, requests carrying a valid `id_token_hint`
 * skip it: in the broker chain, logout arrives from the IdP (Keycloak) after
 * the user already chose to sign out there, so the bridge's own dialog is
 * redundant — the auto page injects `logout=yes` and self-submits. The
 * interactive dialog always remains for hint-less requests, where it serves
 * its CSRF-protection purpose (and as the noscript fallback of the
 * auto-confirm page).
 */
const buildLogoutSource =
  (
    autoConfirmWithHint: boolean,
  ): NonNullable<NonNullable<NonNullable<Configuration['features']>['rpInitiatedLogout']>['logoutSource']> =>
  async (ctx, form) => {
    const autoConfirm = autoConfirmWithHint && Boolean(ctx.oidc.entities.IdTokenHint)
    ctx.type = 'html'
    ctx.body = autoConfirm
      ? renderPage('logout-auto.html', { form })
      : renderPage('logout-confirm.html', { form, host: escapeHtml(ctx.host) })
  }

/** Post-logout page (P2.5.1) — shown only when the RP registered no `post_logout_redirect_uri`. */
const postLogoutSuccessSource: NonNullable<
  NonNullable<NonNullable<Configuration['features']>['rpInitiatedLogout']>['postLogoutSuccessSource']
> = async (ctx) => {
  ctx.type = 'html'
  ctx.body = renderPage('logout-success.html')
}

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
 *
 * `adapter` (P1.5) is the storage factory — `MikroOrmAdapter` over Postgres in
 * the app; when omitted (unit tests), the library's in-memory adapter applies.
 */
export function createOidcProvider(
  config: OidcConfig,
  jwks: { keys: Record<string, any>[] },
  accountClaims?: AccountClaimsResolver,
  adapter?: Configuration['adapter'],
): Provider {
  const provider = new Provider(config.issuerUrl, {
    jwks: jwks as Configuration['jwks'],
    ...(adapter && { adapter }),
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
      interactions: {
        policy: buildInteractionPolicy(accountClaims),
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
    // clients; the library default exempts confidential clients. Relaxed
    // between e7ef715 and P1.7 (Keycloak IdPs don't send PKCE by default);
    // restored now that the demo realm pins PKCE S256 on the IdP side —
    // manually configured IdPs must enable it too (§4.6-5).
    pkce: {
      required: () => true,
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
      // P2.5 — logout, wired to Keycloak (§1 step 8): RP-initiated logout with
      // the custom confirmation page (auto-confirmed on a valid id_token_hint,
      // P2.5.1), and back-channel logout_tokens (`sid`-matched) POSTed to
      // clients that registered a backchannel_logout_uri.
      rpInitiatedLogout: {
        enabled: true,
        logoutSource: buildLogoutSource(config.logoutAutoConfirm),
        postLogoutSuccessSource,
      },
      backchannelLogout: { enabled: true },
    },
    // Dev-only, refused in production (OIDC_ALLOW_PRIVATE_NETWORK_CALLS): the
    // library's outbound fetch destroys connections to special-use IPs (SSRF
    // protection) — in dev the back-channel logout receiver (Keycloak) lives
    // on localhost, so the protective dispatcher must be dropped there.
    ...(config.allowPrivateNetworkCalls && {
      fetch: ((url, options) => {
        delete (options as RequestInit & { dispatcher?: unknown }).dispatcher
        return globalThis.fetch(url, options)
      }) as NonNullable<Configuration['fetch']>,
    }),
    // Defaults, made explicit where the integration docs reference the paths
    // (the userinfo default would otherwise be `/me`; end_session is what the
    // Keycloak realm's IdP `logoutUrl` points at).
    routes: {
      authorization: '/authorize',
      token: '/token',
      jwks: '/jwks',
      userinfo: '/userinfo',
      end_session: '/session/end',
    },
    renderError,
  })

  // TLS terminates at the reverse proxy — trust X-Forwarded-* (INTEGRATION.md §1).
  provider.proxy = true

  // Uncaught provider exceptions render a generic "server_error" page and are
  // otherwise invisible — surface the stack in the service log.
  const logger = new Logger('OidcProvider')
  provider.on('server_error', (ctx: { method?: string; path?: string }, err: Error) => {
    logger.error(`server_error at ${ctx?.method} ${ctx?.path}: ${err?.message}`, err?.stack)
  })

  // Back-channel logout failures are otherwise swallowed (P2.5) — the SSRF
  // protection destroying a private-network connection lands here too.
  provider.on('backchannel.error', (_ctx, err: Error, client: { clientId?: string }) => {
    logger.warn(`back-channel logout to client '${client?.clientId}' failed: ${err?.message}`)
  })

  return provider
}
