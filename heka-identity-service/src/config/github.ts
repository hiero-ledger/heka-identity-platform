import { registerAs } from '@nestjs/config'

import { isProductionNodeEnv } from './insecure-defaults'

/**
 * Contributor verification (optional, off by default): a signed-in user links a GitHub account,
 * proves ownership of a GPG key published on GitHub, and receives a contributor credential.
 * When disabled, its routes are not registered and no GitHub setting is required.
 */
export interface GithubConfig {
  /** `CONTRIBUTOR_VERIFICATION_ENABLED`: registers the contributor onboarding, GPG challenge and contributor credential modules. */
  enabled: boolean
  /** OAuth app used to link a GitHub account. The three are required when enabled. */
  clientId?: string
  clientSecret?: string
  /** The web UI page GitHub redirects to; it posts the code to the link callback route. */
  callbackUrl?: string
  authorizeUrl: string
  tokenUrl: string
  /** Authenticated user endpoint; the REST API root is derived from it. */
  userApiUrl: string
  /** Revokes the OAuth token once the identity is read. Derived from `userApiUrl` and `clientId`. */
  tokenRevocationUrl?: string
  /** Host of the public key files, `<gpgKeyBaseUrl>/<login>.gpg`. */
  gpgKeyBaseUrl: string
  /** Deadline for each outbound GitHub request. */
  requestTimeoutMs: number
}

export const githubConfigDefaults = {
  authorizeUrl: 'https://github.com/login/oauth/authorize',
  tokenUrl: 'https://github.com/login/oauth/access_token',
  userApiUrl: 'https://api.github.com/user',
  gpgKeyBaseUrl: 'https://github.com',
  requestTimeoutMs: 8_000,
}

const text = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

/**
 * The `ConditionalModule` condition: only `true` (any case) enables the feature.
 * Other values are rejected when the configuration loads, so a typo cannot pass unnoticed.
 */
export const isContributorVerificationEnabled = (env: NodeJS.ProcessEnv): boolean =>
  text(env.CONTRIBUTOR_VERIFICATION_ENABLED)?.toLowerCase() === 'true'

export default registerAs('github', (): GithubConfig => {
  const problems: string[] = []
  const isProduction = isProductionNodeEnv()

  const enabledValue = text(process.env.CONTRIBUTOR_VERIFICATION_ENABLED)?.toLowerCase()
  if (enabledValue !== undefined && enabledValue !== 'true' && enabledValue !== 'false') {
    problems.push('CONTRIBUTOR_VERIFICATION_ENABLED must be true or false')
  }
  const enabled = enabledValue === 'true'

  const clientId = text(process.env.GITHUB_CLIENT_ID)
  const clientSecret = text(process.env.GITHUB_CLIENT_SECRET)
  const callbackUrl = text(process.env.GITHUB_CALLBACK_URL)
  const authorizeUrl = text(process.env.GITHUB_OAUTH_AUTHORIZE_URL) ?? githubConfigDefaults.authorizeUrl
  const tokenUrl = text(process.env.GITHUB_OAUTH_TOKEN_URL) ?? githubConfigDefaults.tokenUrl
  const userApiUrl = text(process.env.GITHUB_USER_API_URL) ?? githubConfigDefaults.userApiUrl
  const gpgKeyBaseUrl = text(process.env.GITHUB_GPG_KEY_BASE_URL) ?? githubConfigDefaults.gpgKeyBaseUrl
  const timeoutValue = text(process.env.GITHUB_REQUEST_TIMEOUT_MS)
  const requestTimeoutMs = timeoutValue === undefined ? githubConfigDefaults.requestTimeoutMs : Number(timeoutValue)

  if (enabled) {
    const required = {
      GITHUB_CLIENT_ID: clientId,
      GITHUB_CLIENT_SECRET: clientSecret,
      GITHUB_CALLBACK_URL: callbackUrl,
    }
    const missing = Object.entries(required)
      .filter(([, value]) => !value)
      .map(([key]) => key)
    if (missing.length > 0) {
      problems.push(`CONTRIBUTOR_VERIFICATION_ENABLED=true requires ${missing.join(', ')}`)
    }

    const urls = {
      GITHUB_CALLBACK_URL: callbackUrl,
      GITHUB_OAUTH_AUTHORIZE_URL: authorizeUrl,
      GITHUB_OAUTH_TOKEN_URL: tokenUrl,
      GITHUB_USER_API_URL: userApiUrl,
      GITHUB_GPG_KEY_BASE_URL: gpgKeyBaseUrl,
    }
    for (const [key, url] of Object.entries(urls)) {
      if (!url) continue
      const protocol = URL.canParse(url) ? new URL(url).protocol : undefined
      if (protocol !== 'http:' && protocol !== 'https:') {
        problems.push(`${key} must be an http(s) URL`)
      } else if (isProduction && protocol !== 'https:') {
        problems.push(`${key} must use HTTPS in production`)
      }
    }

    if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 1) {
      problems.push('GITHUB_REQUEST_TIMEOUT_MS must be a positive integer (milliseconds)')
    }
  }

  if (problems.length > 0) {
    throw new Error(`Contributor verification configuration is invalid:\n - ${problems.join('\n - ')}`)
  }

  const apiRoot = userApiUrl.replace(/\/user\/?$/, '')
  return {
    enabled,
    clientId,
    clientSecret,
    callbackUrl,
    authorizeUrl,
    tokenUrl,
    userApiUrl,
    tokenRevocationUrl: clientId ? `${apiRoot}/applications/${encodeURIComponent(clientId)}/token` : undefined,
    gpgKeyBaseUrl,
    requestTimeoutMs,
  }
})
