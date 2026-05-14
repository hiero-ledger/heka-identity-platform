import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  AgentSecretsValidationError,
  validateAgentSecrets,
} from '../validate-agent-secrets'

const VALID_JWK = JSON.stringify({
  kty: 'EC',
  x: 'test-x',
  y: 'test-y',
  crv: 'P-256',
  d: 'test-d',
  kid: 'test-kid',
})

function buildValidEnv(): NodeJS.ProcessEnv {
  return {
    INDY_ENDORSER_SEED: 'test-endorser-seed-value-0000001',
    INDY_BESU_ENDORSER_PRIVATE_KEY: 'a'.repeat(64),
    HEDERA_OPERATOR_KEY: '302e020100300506032b65700422042000'.padEnd(96, '0'),
    MDL_ISSUER_CERTIFICATE: 'MIIBdummycertificatevalue',
    MDL_ISSUER_PRIVATE_KEY: VALID_JWK,
  }
}

describe('validateAgentSecrets', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('returns all validated secrets when every required variable is set', () => {
    const secrets = validateAgentSecrets(buildValidEnv())

    expect(secrets.INDY_ENDORSER_SEED).toBe('test-endorser-seed-value-0000001')
    expect(secrets.INDY_BESU_ENDORSER_PRIVATE_KEY).toBe('a'.repeat(64))
    expect(secrets.HEDERA_OPERATOR_KEY.length).toBeGreaterThan(0)
    expect(secrets.MDL_ISSUER_CERTIFICATE).toBe('MIIBdummycertificatevalue')
    expect(secrets.MDL_ISSUER_PRIVATE_KEY).toBe(VALID_JWK)
    expect(secrets.MDL_ISSUER_PRIVATE_KEY_JWK).toEqual({
      kty: 'EC',
      x: 'test-x',
      y: 'test-y',
      crv: 'P-256',
      d: 'test-d',
      kid: 'test-kid',
    })
  })

  it('defaults to process.env when no env is passed', () => {
    process.env = { ...originalEnv, ...buildValidEnv() }

    expect(() => validateAgentSecrets()).not.toThrow()
  })

  it('throws AgentSecretsValidationError when INDY_ENDORSER_SEED is missing', () => {
    const env = buildValidEnv()
    delete env.INDY_ENDORSER_SEED

    expect(() => validateAgentSecrets(env)).toThrow(AgentSecretsValidationError)
    expect(() => validateAgentSecrets(env)).toThrow(/INDY_ENDORSER_SEED is required but not set/)
  })

  it('throws AgentSecretsValidationError when INDY_ENDORSER_SEED is empty string', () => {
    const env = { ...buildValidEnv(), INDY_ENDORSER_SEED: '' }

    expect(() => validateAgentSecrets(env)).toThrow(/INDY_ENDORSER_SEED is required but not set/)
  })

  it('throws AgentSecretsValidationError when INDY_BESU_ENDORSER_PRIVATE_KEY is missing', () => {
    const env = buildValidEnv()
    delete env.INDY_BESU_ENDORSER_PRIVATE_KEY

    expect(() => validateAgentSecrets(env)).toThrow(AgentSecretsValidationError)
    expect(() => validateAgentSecrets(env)).toThrow(
      /INDY_BESU_ENDORSER_PRIVATE_KEY is required but not set/,
    )
  })

  it('throws AgentSecretsValidationError when HEDERA_OPERATOR_KEY is missing', () => {
    const env = buildValidEnv()
    delete env.HEDERA_OPERATOR_KEY

    expect(() => validateAgentSecrets(env)).toThrow(AgentSecretsValidationError)
    expect(() => validateAgentSecrets(env)).toThrow(/HEDERA_OPERATOR_KEY is required but not set/)
  })

  it('throws AgentSecretsValidationError when MDL_ISSUER_CERTIFICATE is missing', () => {
    const env = buildValidEnv()
    delete env.MDL_ISSUER_CERTIFICATE

    expect(() => validateAgentSecrets(env)).toThrow(AgentSecretsValidationError)
    expect(() => validateAgentSecrets(env)).toThrow(
      /MDL_ISSUER_CERTIFICATE is required but not set/,
    )
  })

  it('throws AgentSecretsValidationError when MDL_ISSUER_PRIVATE_KEY is missing', () => {
    const env = buildValidEnv()
    delete env.MDL_ISSUER_PRIVATE_KEY

    expect(() => validateAgentSecrets(env)).toThrow(AgentSecretsValidationError)
    expect(() => validateAgentSecrets(env)).toThrow(
      /MDL_ISSUER_PRIVATE_KEY is required but not set/,
    )
  })

  it('aggregates every missing variable into a single error (fail-fast friendly)', () => {
    const env: NodeJS.ProcessEnv = {}

    try {
      validateAgentSecrets(env)
      throw new Error('Expected validateAgentSecrets to throw')
    } catch (err) {
      expect(err).toBeInstanceOf(AgentSecretsValidationError)
      const issues = (err as AgentSecretsValidationError).issues
      expect(issues).toHaveLength(5)
      expect(issues).toEqual(
        expect.arrayContaining([
          'INDY_ENDORSER_SEED is required but not set',
          'INDY_BESU_ENDORSER_PRIVATE_KEY is required but not set',
          'HEDERA_OPERATOR_KEY is required but not set',
          'MDL_ISSUER_CERTIFICATE is required but not set',
          'MDL_ISSUER_PRIVATE_KEY is required but not set',
        ]),
      )
    }
  })

  it('throws AgentSecretsValidationError when MDL_ISSUER_PRIVATE_KEY is not valid JSON', () => {
    const env = { ...buildValidEnv(), MDL_ISSUER_PRIVATE_KEY: 'not-json-at-all' }

    expect(() => validateAgentSecrets(env)).toThrow(AgentSecretsValidationError)
    expect(() => validateAgentSecrets(env)).toThrow(
      /MDL_ISSUER_PRIVATE_KEY must be a JSON-encoded JWK/,
    )
  })

  it('throws AgentSecretsValidationError when MDL_ISSUER_PRIVATE_KEY is JSON but not an object', () => {
    const env = { ...buildValidEnv(), MDL_ISSUER_PRIVATE_KEY: '"just-a-string"' }

    expect(() => validateAgentSecrets(env)).toThrow(AgentSecretsValidationError)
    expect(() => validateAgentSecrets(env)).toThrow(
      /MDL_ISSUER_PRIVATE_KEY must decode to a JWK object/,
    )
  })
})
