import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  auth0PlaceholderEmail,
  exportUsers,
  parseArgon2Hash,
  toAuth0User,
  toKeycloakCredential,
  toKeycloakPartialImport,
  toKeycloakUser,
} from './user-export.mjs'

// A hash produced by the `argon2` package with its defaults (argon2id, v=19, m=65536, t=3, p=4, 32-byte hash).
const ENCODED = '$argon2id$v=19$m=65536,t=3,p=4$YWJjZGVmZ2hpamtsbW5vcA$K0hM9m0ZVzEpZk8ClqYMxsUgHOdQeHZgO+5nNgjUEUA'

const user = (overrides = {}) => ({
  id: '7531a1f6-822d-446d-b878-658616a4df15',
  name: 'demo',
  role: 'Admin',
  password: ENCODED,
  ...overrides,
})

describe('parseArgon2Hash', () => {
  test('splits the encoded form into variant, parameters, salt and hash bytes', () => {
    const parsed = parseArgon2Hash(ENCODED)

    assert.equal(parsed.variant, 'argon2id')
    assert.equal(parsed.version, 19)
    assert.equal(parsed.memoryKiB, 65536)
    assert.equal(parsed.iterations, 3)
    assert.equal(parsed.parallelism, 4)
    assert.equal(parsed.salt.toString(), 'abcdefghijklmnop')
    assert.equal(parsed.hash.length, 32)
  })

  test('rejects anything else', () => {
    assert.throws(() => parseArgon2Hash('plain-text'), /not an encoded argon2 hash/)
    assert.throws(() => parseArgon2Hash('$2b$12$abcdefghijklmnopqrstuu'), /not an encoded argon2 hash/)
  })
})

describe('Keycloak export', () => {
  test('stores the hash and salt as base64 with the argon2 parameters Keycloak expects', () => {
    const credential = toKeycloakCredential(ENCODED)

    assert.equal(credential.type, 'password')
    assert.deepEqual(JSON.parse(credential.secretData), {
      value: Buffer.from('K0hM9m0ZVzEpZk8ClqYMxsUgHOdQeHZgO+5nNgjUEUA', 'base64').toString('base64'),
      salt: Buffer.from('abcdefghijklmnop').toString('base64'),
      additionalParameters: {},
    })
    assert.deepEqual(JSON.parse(credential.credentialData), {
      hashIterations: 3,
      algorithm: 'argon2',
      additionalParameters: {
        hashLength: ['32'],
        memory: ['65536'],
        type: ['id'],
        version: ['1.3'],
        parallelism: ['4'],
      },
    })
  })

  test('keeps the user id, sets heka_uid and puts Admin users into the default group', () => {
    const exported = toKeycloakUser(user())

    assert.equal(exported.id, '7531a1f6-822d-446d-b878-658616a4df15')
    assert.equal(exported.username, 'demo')
    assert.equal(exported.enabled, true)
    assert.deepEqual(exported.attributes, { heka_uid: ['7531a1f6-822d-446d-b878-658616a4df15'] })
    assert.equal(exported.credentials.length, 1)
    assert.deepEqual(exported.groups, ['/heka-users'])
    assert.equal(exported.clientRoles, undefined)
  })

  test('gives organization roles the client role and the org id attribute instead of the group', () => {
    const exported = toKeycloakUser(user({ name: 'doctor', role: 'Issuer' }), { orgId: 'org-1' })

    assert.equal(exported.groups, undefined)
    assert.deepEqual(exported.clientRoles, { 'heka-identity-service': ['Issuer'] })
    assert.deepEqual(exported.attributes, { heka_uid: ['7531a1f6-822d-446d-b878-658616a4df15'], org_id: ['org-1'] })
  })

  test('gives the User role its client role without an org id', () => {
    const exported = toKeycloakUser(user({ role: 'User' }), { orgId: 'org-1' })

    assert.deepEqual(exported.clientRoles, { 'heka-identity-service': ['User'] })
    assert.deepEqual(exported.attributes, { heka_uid: ['7531a1f6-822d-446d-b878-658616a4df15'] })
  })

  test('refuses organization roles without an org id, unknown roles and incomplete rows', () => {
    assert.throws(() => toKeycloakUser(user({ role: 'Verifier' })), /no org id is configured/)
    assert.throws(() => toKeycloakUser(user({ role: 'Superuser' })), /unknown role 'Superuser'/)
    assert.throws(() => toKeycloakUser({ id: 'x', name: 'y', role: 'Admin' }), /has no 'password'/)
  })

  test('can leave the passwords out and require a new one', () => {
    const exported = toKeycloakUser(user(), { withoutPasswords: true })

    assert.equal(exported.credentials, undefined)
    assert.deepEqual(exported.requiredActions, ['UPDATE_PASSWORD'])
  })

  test('wraps the users in a partial import that skips existing resources', () => {
    const partialImport = toKeycloakPartialImport([user(), user({ id: 'u2', name: 'other' })])

    assert.equal(partialImport.ifResourceExists, 'SKIP')
    assert.deepEqual(
      partialImport.users.map((u) => u.username),
      ['demo', 'other'],
    )
  })
})

describe('Auth0 export', () => {
  test('synthesizes an e-mail from the username', () => {
    assert.equal(auth0PlaceholderEmail('demo'), 'demo@heka.invalid')
    assert.equal(auth0PlaceholderEmail('John Doe (org)', 'example.org'), 'john_doe__org_@example.org')
  })

  test('keeps the user id, passes the encoded hash through and sets the Heka metadata', () => {
    assert.deepEqual(toAuth0User(user()), {
      user_id: '7531a1f6-822d-446d-b878-658616a4df15',
      email: 'demo@heka.invalid',
      email_verified: false,
      username: 'demo',
      name: 'demo',
      custom_password_hash: { algorithm: 'argon2', hash: { value: ENCODED } },
      app_metadata: { heka_uid: '7531a1f6-822d-446d-b878-658616a4df15', heka_role: 'Admin' },
    })
  })

  test('adds the org id for organization roles and honours the e-mail domain', () => {
    const exported = toAuth0User(user({ name: 'doctor', role: 'Issuer' }), { orgId: 'org-1', emailDomain: 'example.org' })

    assert.equal(exported.email, 'doctor@example.org')
    assert.deepEqual(exported.app_metadata, {
      heka_uid: '7531a1f6-822d-446d-b878-658616a4df15',
      heka_role: 'Issuer',
      org_id: 'org-1',
    })
  })

  test('can leave the passwords out', () => {
    assert.equal(toAuth0User(user(), { withoutPasswords: true }).custom_password_hash, undefined)
  })

  test('refuses a password that is not an argon2 hash', () => {
    assert.throws(() => toAuth0User(user({ password: 'plain' })), /not an encoded argon2 hash/)
  })
})

describe('exportUsers', () => {
  test('selects the format by target', () => {
    assert.equal(exportUsers('keycloak', [user()]).ifResourceExists, 'SKIP')
    assert.equal(exportUsers('auth0', [user()])[0].user_id, user().id)
    assert.throws(() => exportUsers('okta', []), /unknown target 'okta'/)
  })
})
