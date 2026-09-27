import { OidcClientConfig, OidcConfig } from '@config'
import { Logger } from '@nestjs/common'
import Provider, { ClientMetadata, Configuration, interactionPolicy } from 'oidc-provider'

import { ClaimSet } from './claims.util'
import { renderPage } from './pages'

export const OIDC_PROVIDER = 'OIDC_PROVIDER'

export interface AccountClaimsResolver {
  get(sub: string): ClaimSet | undefined
}

const openidScopeClaims = (config: OidcConfig): string[] => {
  const names = new Set<string>(['sub', 'amr', 'login_config_id', 'vc_presented_attributes'])
  for (const loginConfig of config.loginConfigs) {
    for (const claimName of Object.values(loginConfig.claimMapping)) names.add(claimName)
    for (const claimName of Object.keys(loginConfig.staticClaims ?? {})) names.add(claimName)
  }
  return [...names].sort()
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`)

const renderError: NonNullable<Configuration['renderError']> = async (ctx, out) => {
  ctx.type = 'html'
  ctx.body = renderPage('error.html', {
    details: Object.entries(out)
      .map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(String(value))}</dd>`)
      .join('\n'),
  })
}

const buildInteractionPolicy = (accountClaims: AccountClaimsResolver) => {
  const policy = interactionPolicy.base()
  policy.get('login')!.checks.add(
    new interactionPolicy.Check('claims_unresolvable', 'session account claims are no longer resolvable', (ctx) => {
      const accountId = ctx.oidc.session?.accountId
      if (accountId && !accountClaims.get(accountId)) return interactionPolicy.Check.REQUEST_PROMPT
      return interactionPolicy.Check.NO_NEED_TO_PROMPT
    })
  )
  return policy
}

const toClientMetadata = (client: OidcClientConfig): ClientMetadata => ({
  client_id: client.clientId,
  client_secret: client.clientSecret,
  redirect_uris: client.redirectUris,
  grant_types: client.grantTypes,
  response_types: client.responseTypes as ClientMetadata['response_types'],
  token_endpoint_auth_method: client.tokenEndpointAuthMethod as ClientMetadata['token_endpoint_auth_method'],
  ...(client.postLogoutRedirectUris !== undefined && { post_logout_redirect_uris: client.postLogoutRedirectUris }),
  ...(client.backchannelLogoutUri !== undefined && {
    backchannel_logout_uri: client.backchannelLogoutUri,
    backchannel_logout_session_required: client.backchannelLogoutSessionRequired ?? true,
  }),
  ...(client.loginConfigId !== undefined && { login_config_id: client.loginConfigId }),
})

const buildLogoutSource =
  (autoConfirmWithHint: boolean): NonNullable<NonNullable<NonNullable<Configuration['features']>['rpInitiatedLogout']>['logoutSource']> =>
  async (ctx, form) => {
    const autoConfirm = autoConfirmWithHint && Boolean(ctx.oidc.entities.IdTokenHint)
    ctx.type = 'html'
    ctx.body = autoConfirm
      ? renderPage('logout-auto.html', { form })
      : renderPage('logout-confirm.html', { form, host: escapeHtml(ctx.host) })
  }

const postLogoutSuccessSource: NonNullable<
  NonNullable<NonNullable<Configuration['features']>['rpInitiatedLogout']>['postLogoutSuccessSource']
> = async (ctx) => {
  ctx.type = 'html'
  ctx.body = renderPage('logout-success.html')
}

export function createOidcProvider(
  config: OidcConfig,
  jwks: { keys: Record<string, any>[] },
  accountClaims?: AccountClaimsResolver,
  adapter?: Configuration['adapter']
): Provider {
  const provider = new Provider(config.issuerUrl, {
    jwks: jwks as Configuration['jwks'],
    ...(adapter && { adapter }),
    clients: config.clients.map(toClientMetadata),
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
    responseTypes: ['code'],
    clientAuthMethods: ['client_secret_basic', 'client_secret_post'],
    pkce: {
      required: () => true,
    },
    clockTolerance: config.clockTolerance,
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
    routes: {
      authorization: '/authorize',
      token: '/token',
      jwks: '/jwks',
      userinfo: '/userinfo',
      end_session: '/session/end',
    },
    renderError,
  })

  provider.proxy = true

  const logger = new Logger('OidcProvider')
  provider.on('server_error', (ctx: { method?: string; path?: string }, err: Error) => {
    logger.error(`server_error at ${ctx?.method} ${ctx?.path}: ${err?.message}`, err?.stack)
  })

  provider.on('backchannel.error', (_ctx, err: Error, client: { clientId?: string }) => {
    logger.warn(`back-channel logout to client '${client?.clientId}' failed: ${err?.message}`)
  })

  return provider
}
