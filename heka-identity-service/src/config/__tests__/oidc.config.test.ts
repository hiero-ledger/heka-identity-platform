import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import oidcConfig, { oidcClaimsDefaults } from 'config/oidc'

const OIDC_ENV_KEYS = [
  'OIDC_ISSUER_URL',
  'OIDC_JWKS_URI',
  'OIDC_JWKS',
  'OIDC_AUDIENCE',
  'OIDC_ALGORITHMS',
  'OIDC_CLOCK_TOLERANCE',
  'OIDC_CLAIM_USER_ID',
  'OIDC_CLAIM_ROLES',
  'OIDC_CLAIM_NAME',
  'OIDC_CLAIM_ORG_ID',
]

describe('oidc config', () => {
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    originalEnv = { ...process.env }
    for (const key of OIDC_ENV_KEYS) {
      delete process.env[key]
    }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('leaves provider settings unset and applies defaults when nothing is configured', () => {
    const config = oidcConfig()

    expect(config.issuerUrl).toBeUndefined()
    expect(config.jwksUri).toBeUndefined()
    expect(config.jwks).toBeUndefined()
    expect(config.audience).toBeUndefined()
    expect(config.algorithms).toEqual(['RS256'])
    expect(config.clockTolerance).toBe(15)
    expect(config.claims).toEqual(oidcClaimsDefaults)
  })

  it('reads provider settings from the environment', () => {
    process.env.OIDC_ISSUER_URL = ' https://heka.eu.auth0.com/ '
    process.env.OIDC_AUDIENCE = 'https://heka-identity'
    process.env.OIDC_JWKS_URI = 'https://heka.eu.auth0.com/.well-known/jwks.json'
    process.env.OIDC_ALGORITHMS = 'RS256, ES256'
    process.env.OIDC_CLOCK_TOLERANCE = '30'

    const config = oidcConfig()

    expect(config.issuerUrl).toBe('https://heka.eu.auth0.com/')
    expect(config.audience).toBe('https://heka-identity')
    expect(config.jwksUri).toBe('https://heka.eu.auth0.com/.well-known/jwks.json')
    expect(config.algorithms).toEqual(['RS256', 'ES256'])
    expect(config.clockTolerance).toBe(30)
  })

  it('parses an inline JWKS', () => {
    process.env.OIDC_JWKS = '{"keys":[{"kty":"RSA","kid":"k1","n":"abc","e":"AQAB"}]}'

    const config = oidcConfig()

    expect(config.jwks).toEqual({ keys: [{ kty: 'RSA', kid: 'k1', n: 'abc', e: 'AQAB' }] })
  })

  it('treats blank values as unset', () => {
    process.env.OIDC_ISSUER_URL = '   '
    process.env.OIDC_AUDIENCE = ''
    process.env.OIDC_CLAIM_ROLES = ' '

    const config = oidcConfig()

    expect(config.issuerUrl).toBeUndefined()
    expect(config.audience).toBeUndefined()
    expect(config.claims.roles).toBe('roles')
  })

  it('reads claim paths, including namespaced names and fallback lists', () => {
    process.env.OIDC_CLAIM_USER_ID = 'https://heka/heka_uid'
    process.env.OIDC_CLAIM_ROLES = '/https:~1~1heka~1roles'
    process.env.OIDC_CLAIM_NAME = 'https://heka/name, name ,nickname'
    process.env.OIDC_CLAIM_ORG_ID = 'https://heka/org_id'

    const config = oidcConfig()

    expect(config.claims).toEqual({
      userId: 'https://heka/heka_uid',
      roles: '/https:~1~1heka~1roles',
      name: ['https://heka/name', 'name', 'nickname'],
      orgId: 'https://heka/org_id',
    })
  })
})
