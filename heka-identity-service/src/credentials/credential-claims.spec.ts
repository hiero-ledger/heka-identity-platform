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
      githubUsername: 'darshit2308',
      githubAccountId: 4115704,
      gpgFingerprint: '3AA5C34371567BD2',
    }
    expect(validate(validClaims)).toBe(true)
  })

  it('should reject githubAccountId passed as a string', () => {
    const invalidClaims = {
      githubUsername: 'darshit2308',
      githubAccountId: '4115704',
      gpgFingerprint: '3AA5C34371567BD2',
    }
    expect(validate(invalidClaims)).toBe(false)
  })

  it('should reject missing required claims', () => {
    const incompleteClaims = {
      githubUsername: 'darshit2308',
    }
    expect(validate(incompleteClaims)).toBe(false)
  })

  it('should reject an empty githubUsername', () => {
    const claims = {
      githubUsername: '',
      githubAccountId: 4115704,
      gpgFingerprint: '3AA5C34371567BD2',
    }
    expect(validate(claims)).toBe(false)
  })

  it('should reject a gpgFingerprint that does not match the hex pattern', () => {
    const claims = {
      githubUsername: 'darshit2308',
      githubAccountId: 4115704,
      gpgFingerprint: 'not-a-hex-fingerprint',
    }
    expect(validate(claims)).toBe(false)
  })

  it('should reject additional properties not in the schema', () => {
    const claims = {
      githubUsername: 'darshit2308',
      githubAccountId: 4115704,
      gpgFingerprint: '3AA5C34371567BD2',
      extraField: 'should-not-be-here',
    }
    expect(validate(claims)).toBe(false)
  })
})
