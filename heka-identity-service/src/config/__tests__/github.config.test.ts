import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import githubConfig, { isContributorVerificationEnabled } from 'config/github'

const ENV_KEYS = [
  'NODE_ENV',
  'CONTRIBUTOR_VERIFICATION_ENABLED',
  'GITHUB_CLIENT_ID',
  'GITHUB_CLIENT_SECRET',
  'GITHUB_CALLBACK_URL',
  'GITHUB_OAUTH_AUTHORIZE_URL',
  'GITHUB_OAUTH_TOKEN_URL',
  'GITHUB_USER_API_URL',
  'GITHUB_GPG_KEY_BASE_URL',
  'GITHUB_REQUEST_TIMEOUT_MS',
  'CONTRIBUTOR_ISSUER_ORG_ID',
  'CONTRIBUTOR_ISSUER_DID',
]

const enabledEnv = () => {
  process.env.CONTRIBUTOR_VERIFICATION_ENABLED = 'true'
  process.env.GITHUB_CLIENT_ID = 'Iv1.client'
  process.env.GITHUB_CLIENT_SECRET = 'client-secret'
  process.env.GITHUB_CALLBACK_URL = 'http://localhost:8000/github/callback'
  process.env.CONTRIBUTOR_ISSUER_ORG_ID = 'hiero-contributors'
  process.env.CONTRIBUTOR_ISSUER_DID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'
}

describe('contributor verification (github) config', () => {
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    originalEnv = { ...process.env }
    for (const key of ENV_KEYS) {
      delete process.env[key]
    }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('is disabled with GitHub defaults and requires nothing when unset', () => {
    expect(githubConfig()).toEqual({
      enabled: false,
      clientId: undefined,
      clientSecret: undefined,
      callbackUrl: undefined,
      authorizeUrl: 'https://github.com/login/oauth/authorize',
      tokenUrl: 'https://github.com/login/oauth/access_token',
      userApiUrl: 'https://api.github.com/user',
      tokenRevocationUrl: undefined,
      gpgKeyBaseUrl: 'https://github.com',
      requestTimeoutMs: 8000,
      issuerOrgId: undefined,
      issuerDid: undefined,
    })
    expect(isContributorVerificationEnabled(process.env)).toBe(false)
  })

  it('is disabled by false, and empty values (as compose passes them) mean the default', () => {
    process.env.CONTRIBUTOR_VERIFICATION_ENABLED = 'false'
    process.env.GITHUB_GPG_KEY_BASE_URL = ''
    process.env.GITHUB_REQUEST_TIMEOUT_MS = ''

    expect(githubConfig()).toMatchObject({
      enabled: false,
      gpgKeyBaseUrl: 'https://github.com',
      requestTimeoutMs: 8000,
    })
    expect(isContributorVerificationEnabled(process.env)).toBe(false)
  })

  it('does not validate the GitHub and issuer settings while disabled', () => {
    process.env.GITHUB_CALLBACK_URL = 'not a url'
    process.env.GITHUB_REQUEST_TIMEOUT_MS = 'soon'
    process.env.CONTRIBUTOR_ISSUER_ORG_ID = 'two words'
    process.env.CONTRIBUTOR_ISSUER_DID = 'not-a-did'

    expect(githubConfig().enabled).toBe(false)
  })

  it('is enabled by true (any case) with the OAuth app settings', () => {
    enabledEnv()
    process.env.CONTRIBUTOR_VERIFICATION_ENABLED = 'TRUE'

    expect(githubConfig()).toMatchObject({
      enabled: true,
      clientId: 'Iv1.client',
      clientSecret: 'client-secret',
      callbackUrl: 'http://localhost:8000/github/callback',
      tokenRevocationUrl: 'https://api.github.com/applications/Iv1.client/token',
      issuerOrgId: 'hiero-contributors',
      issuerDid: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
    })
    expect(isContributorVerificationEnabled(process.env)).toBe(true)
  })

  it.each(['yes', '1', 'on', 'enabled'])('rejects %s: only true or false', (value) => {
    process.env.CONTRIBUTOR_VERIFICATION_ENABLED = value

    expect(() => githubConfig()).toThrow('CONTRIBUTOR_VERIFICATION_ENABLED must be true or false')
    expect(isContributorVerificationEnabled(process.env)).toBe(false)
  })

  it('requires the OAuth app and issuer settings when enabled, and names every missing one', () => {
    process.env.CONTRIBUTOR_VERIFICATION_ENABLED = 'true'
    process.env.GITHUB_CLIENT_ID = 'Iv1.client'

    expect(() => githubConfig()).toThrow(
      'CONTRIBUTOR_VERIFICATION_ENABLED=true requires GITHUB_CLIENT_SECRET, GITHUB_CALLBACK_URL, ' +
        'CONTRIBUTOR_ISSUER_ORG_ID, CONTRIBUTOR_ISSUER_DID',
    )
  })

  it('requires the issuer organization and DID, also when only they are missing', () => {
    enabledEnv()
    process.env.CONTRIBUTOR_ISSUER_ORG_ID = ' '
    delete process.env.CONTRIBUTOR_ISSUER_DID

    expect(() => githubConfig()).toThrow(
      'CONTRIBUTOR_VERIFICATION_ENABLED=true requires CONTRIBUTOR_ISSUER_ORG_ID, CONTRIBUTOR_ISSUER_DID',
    )
  })

  it.each(['hiero contributors', 'hiero\tcontributors'])('rejects the issuer organization %j', (value) => {
    enabledEnv()
    process.env.CONTRIBUTOR_ISSUER_ORG_ID = value

    expect(() => githubConfig()).toThrow('CONTRIBUTOR_ISSUER_ORG_ID must not contain whitespace')
  })

  it.each(['z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK', 'did:key', 'did:Key:z6Mk', 'DID:key:z6Mk'])(
    'rejects the issuer DID %s',
    (value) => {
      enabledEnv()
      process.env.CONTRIBUTOR_ISSUER_DID = value

      expect(() => githubConfig()).toThrow('CONTRIBUTOR_ISSUER_DID must be a DID (did:<method>:<id>)')
    },
  )

  it('accepts a did:hedera issuer DID and trims both issuer settings', () => {
    enabledEnv()
    process.env.CONTRIBUTOR_ISSUER_ORG_ID = ' hiero-contributors '
    process.env.CONTRIBUTOR_ISSUER_DID = ' did:hedera:testnet:z6Mkabc_0.0.12345 '

    expect(githubConfig()).toMatchObject({
      issuerOrgId: 'hiero-contributors',
      issuerDid: 'did:hedera:testnet:z6Mkabc_0.0.12345',
    })
  })

  it('collects every problem into one error', () => {
    enabledEnv()
    process.env.GITHUB_CALLBACK_URL = 'localhost:8000/github/callback'
    process.env.GITHUB_USER_API_URL = 'ftp://api.github.com/user'
    process.env.GITHUB_REQUEST_TIMEOUT_MS = '0'
    process.env.CONTRIBUTOR_ISSUER_DID = 'key:z6Mk'

    let message = ''
    try {
      githubConfig()
    } catch (error) {
      message = (error as Error).message
    }
    expect(message).toContain('GITHUB_CALLBACK_URL must be an http(s) URL')
    expect(message).toContain('GITHUB_USER_API_URL must be an http(s) URL')
    expect(message).toContain('GITHUB_REQUEST_TIMEOUT_MS must be a positive integer')
    expect(message).toContain('CONTRIBUTOR_ISSUER_DID must be a DID')
  })

  it.each(['abc', '12.5', '-1'])('rejects the request timeout %s', (value) => {
    enabledEnv()
    process.env.GITHUB_REQUEST_TIMEOUT_MS = value

    expect(() => githubConfig()).toThrow('GITHUB_REQUEST_TIMEOUT_MS must be a positive integer')
  })

  it('requires https URLs in production', () => {
    enabledEnv()
    process.env.NODE_ENV = 'production'
    process.env.GITHUB_CALLBACK_URL = 'http://heka.example.com/github/callback'

    expect(() => githubConfig()).toThrow('GITHUB_CALLBACK_URL must use HTTPS in production')
  })

  it('derives the token revocation endpoint from the configured API', () => {
    enabledEnv()
    process.env.GITHUB_USER_API_URL = 'https://github.example.com/api/v3/user'

    expect(githubConfig().tokenRevocationUrl).toBe('https://github.example.com/api/v3/applications/Iv1.client/token')
  })
})
