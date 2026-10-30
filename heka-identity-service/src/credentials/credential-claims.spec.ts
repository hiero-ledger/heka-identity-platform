import { readFileSync } from 'fs'
import { join } from 'path'

import Ajv, { type ValidateFunction } from 'ajv/dist/2020'

const loadFixture = (fileName: string): Record<string, unknown> => {
  return JSON.parse(readFileSync(join(__dirname, 'fixtures', fileName), 'utf8')) as Record<string, unknown>
}

describe('GithubContributorCredential Claims Validation', () => {
  const ajv = new Ajv()
  let schema: Record<string, unknown>
  let validate: ValidateFunction

  beforeAll(() => {
    schema = loadFixture('github-contributor-credential.schema.json')
    validate = ajv.compile(schema)
  })

  it('should accept valid credential claims', () => {
    const validClaims = {
      githubAccountId: '4115704',
      githubUsername: 'darshit2308',
      gpgFingerprint: '3AA5C34371567BD2',
      verifiedAt: '2026-08-20T12:00:00.000Z',
      walletId: 'User_4115704',
    }
    expect(validate(validClaims)).toBe(true)
  })

  it('should reject githubAccountId passed as an integer', () => {
    const invalidClaims = {
      githubAccountId: 4115704,
      githubUsername: 'darshit2308',
      gpgFingerprint: '3AA5C34371567BD2',
      verifiedAt: '2026-08-20T12:00:00.000Z',
      walletId: 'User_4115704',
    }
    expect(validate(invalidClaims)).toBe(false)
  })

  it('should reject githubAccountId that does not match numeric digits pattern', () => {
    const invalidClaims = {
      githubAccountId: 'not-numeric-account-id',
      githubUsername: 'darshit2308',
      gpgFingerprint: '3AA5C34371567BD2',
      verifiedAt: '2026-08-20T12:00:00.000Z',
      walletId: 'User_4115704',
    }
    expect(validate(invalidClaims)).toBe(false)
  })

  it('should reject missing required claims', () => {
    const incompleteClaims = {
      githubUsername: 'darshit2308',
    }
    expect(validate(incompleteClaims)).toBe(false)
  })

  it('should reject missing verifiedAt or walletId', () => {
    const missingVerifiedAt = {
      githubAccountId: '4115704',
      githubUsername: 'darshit2308',
      gpgFingerprint: '3AA5C34371567BD2',
      walletId: 'User_4115704',
    }
    expect(validate(missingVerifiedAt)).toBe(false)

    const missingWalletId = {
      githubAccountId: '4115704',
      githubUsername: 'darshit2308',
      gpgFingerprint: '3AA5C34371567BD2',
      verifiedAt: '2026-08-20T12:00:00.000Z',
    }
    expect(validate(missingWalletId)).toBe(false)
  })

  it('should reject an empty githubUsername', () => {
    const claims = {
      githubAccountId: '4115704',
      githubUsername: '',
      gpgFingerprint: '3AA5C34371567BD2',
      verifiedAt: '2026-08-20T12:00:00.000Z',
      walletId: 'User_4115704',
    }
    expect(validate(claims)).toBe(false)
  })

  it('should reject a gpgFingerprint that does not match the hex pattern', () => {
    const claims = {
      githubAccountId: '4115704',
      githubUsername: 'darshit2308',
      gpgFingerprint: 'not-a-hex-fingerprint',
      verifiedAt: '2026-08-20T12:00:00.000Z',
      walletId: 'User_4115704',
    }
    expect(validate(claims)).toBe(false)
  })

  it('should reject an empty walletId', () => {
    const claims = {
      githubAccountId: '4115704',
      githubUsername: 'darshit2308',
      gpgFingerprint: '3AA5C34371567BD2',
      verifiedAt: '2026-08-20T12:00:00.000Z',
      walletId: '',
    }
    expect(validate(claims)).toBe(false)
  })

  it('should reject additional properties not in the schema', () => {
    const claims = {
      githubAccountId: '4115704',
      githubUsername: 'darshit2308',
      gpgFingerprint: '3AA5C34371567BD2',
      verifiedAt: '2026-08-20T12:00:00.000Z',
      walletId: 'User_4115704',
      extraField: 'should-not-be-here',
    }
    expect(validate(claims)).toBe(false)
  })
})
