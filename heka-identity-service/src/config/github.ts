import { registerAs } from '@nestjs/config'

/**
 * Public GitHub endpoints used while proving a contributor owns a GPG key.
 * OAuth client settings are added when account linking is wired up.
 */
export default registerAs('github', () => ({
  clientId: process.env.GITHUB_CLIENT_ID,
  clientSecret: process.env.GITHUB_CLIENT_SECRET,
  callbackUrl: process.env.GITHUB_CALLBACK_URL,
  authorizeUrl: process.env.GITHUB_OAUTH_AUTHORIZE_URL ?? 'https://github.com/login/oauth/authorize',
  tokenUrl: process.env.GITHUB_OAUTH_TOKEN_URL ?? 'https://github.com/login/oauth/access_token',
  userApiUrl: process.env.GITHUB_USER_API_URL ?? 'https://api.github.com/user',
  gpgKeyBaseUrl: process.env.GITHUB_GPG_KEY_BASE_URL ?? 'https://github.com',
  requestTimeoutMs: Number(process.env.GITHUB_REQUEST_TIMEOUT_MS ?? 8_000),
  /** Shared secret for GET /v2/gpg-challenge/status. The GitHub App sends it as a bearer token. */
  statusToken: process.env.GITHUB_STATUS_TOKEN,
}))
