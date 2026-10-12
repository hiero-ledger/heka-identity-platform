import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  applyAdminPolicy,
  auth0PlaceholderEmail,
  exportUsers,
  formatMigrationReport,
  parseArgon2Hash,
  planMigration,
  toAuth0User,
  toKeycloakCredential,
  toKeycloakPartialImport,
  toKeycloakUser,
  walletIdFor,
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

  test('keeps the user id, sets heka_uid and puts Admin users into the heka-admins group only', () => {
    const exported = toKeycloakUser(user())

    assert.equal(exported.id, '7531a1f6-822d-446d-b878-658616a4df15')
    assert.equal(exported.username, 'demo')
    assert.equal(exported.enabled, true)
    assert.deepEqual(exported.attributes, { heka_uid: ['7531a1f6-822d-446d-b878-658616a4df15'] })
    assert.equal(exported.credentials.length, 1)
    // Not also heka-users: that group carries User, and a second role is rejected by heka-identity-service
    assert.deepEqual(exported.groups, ['/heka-admins'])
    assert.equal(exported.clientRoles, undefined)
  })

  test('gives organization roles the client role and the org id attribute and no group', () => {
    const exported = toKeycloakUser(user({ name: 'doctor', role: 'Issuer' }), { orgId: 'org-1' })

    assert.deepEqual(exported.groups, [])
    assert.deepEqual(exported.clientRoles, { 'heka-identity-service': ['Issuer'] })
    assert.deepEqual(exported.attributes, { heka_uid: ['7531a1f6-822d-446d-b878-658616a4df15'], org_id: ['org-1'] })
  })

  test('puts User accounts into the heka-users default group, without a client role or an org id', () => {
    const exported = toKeycloakUser(user({ role: 'User' }), { orgId: 'org-1' })

    assert.deepEqual(exported.groups, ['/heka-users'])
    assert.equal(exported.clientRoles, undefined)
    assert.deepEqual(exported.attributes, { heka_uid: ['7531a1f6-822d-446d-b878-658616a4df15'] })
  })

  test('maps every role to exactly one Heka role source', () => {
    for (const role of ['Admin', 'OrgAdmin', 'OrgManager', 'OrgMember', 'Issuer', 'Verifier', 'User']) {
      const exported = toKeycloakUser(user({ role }), { orgId: 'org-1' })
      const sources = (exported.groups ?? []).length + (exported.clientRoles?.['heka-identity-service'] ?? []).length

      assert.equal(sources, 1, `role ${role}`)
    }
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

// A dump shaped like a pre-#215 deployment: the web UI registered everyone as Admin.
const dump = [
  user({ id: 'a1', name: 'operator', role: 'Admin' }),
  user({ id: 'a2', name: 'alice', role: 'Admin' }),
  user({ id: 'a3', name: 'demo', role: 'Admin' }),
  user({ id: 'i1', name: 'doctor', role: 'Issuer' }),
  user({ id: 'u1', name: 'bob', role: 'User' }),
]

describe('walletIdFor', () => {
  test('mirrors getWalletId of heka-identity-service', () => {
    assert.equal(walletIdFor('Admin', 'x', undefined), 'Administration')
    assert.equal(walletIdFor('User', 'x', undefined), 'User_x')
    assert.equal(walletIdFor('OrgManager', 'x', 'org-1'), 'Organization_org-1')
    assert.equal(walletIdFor('Verifier', 'x', 'org-1'), 'Verifier_x_in_Organization_org-1')
    assert.throws(() => walletIdFor('Root', 'x', undefined), /unknown role 'Root'/)
  })
})

describe('applyAdminPolicy', () => {
  test('keeps the named Admins and exports every other Admin as User', () => {
    const roles = applyAdminPolicy(dump, ['operator']).map((u) => [u.name, u.role])
    assert.deepEqual(roles, [['operator', 'Admin'], ['alice', 'User'], ['demo', 'User'], ['doctor', 'Issuer'], ['bob', 'User']])
  })

  test('keeps every stored role without a policy, and leaves the input untouched', () => {
    assert.equal(applyAdminPolicy(dump, undefined), dump)
    applyAdminPolicy(dump, [])
    assert.equal(dump[0].role, 'Admin')
  })

  test('refuses names that are not stored Admins', () => {
    assert.throws(() => applyAdminPolicy(dump, ['nobody']), /--keep-admin 'nobody': no such user/)
    assert.throws(() => applyAdminPolicy(dump, ['bob']), /stored role is 'User', not Admin/)
  })
})

describe('planMigration', () => {
  test('lists the role, org id and wallet of every account after the migration', () => {
    const plan = planMigration(dump, { orgId: 'org-1', keepAdmins: ['operator'] })

    assert.deepEqual(plan[0], { id: 'a1', name: 'operator', storedRole: 'Admin', role: 'Admin', wallet: 'Administration', demoted: false })
    assert.deepEqual(plan[1], { id: 'a2', name: 'alice', storedRole: 'Admin', role: 'User', wallet: 'User_a2', demoted: true })
    assert.deepEqual(plan[3], {
      id: 'i1',
      name: 'doctor',
      storedRole: 'Issuer',
      role: 'Issuer',
      orgId: 'org-1',
      wallet: 'Issuer_i1_in_Organization_org-1',
      demoted: false,
    })
  })

  test('formats a report with a summary', () => {
    const report = formatMigrationReport(planMigration(dump, { orgId: 'org-1', keepAdmins: ['operator'] }))

    const alice = report.split('\n').find((line) => line.startsWith('alice'))
    assert.deepEqual(alice.split(/\s{2,}/), ['alice', 'Admin', 'User (demoted)', 'User_a2'])
    assert.ok(report.includes('5 account(s): Admin 1, OrgAdmin 0, OrgManager 0, OrgMember 0, Issuer 1, Verifier 0, User 3'))
    assert.ok(report.includes('Admin after migration (shared Administration wallet): operator'))
    assert.ok(report.includes('Demoted from Admin to User (start in an empty User_<id> wallet): 2'))
  })
})

describe('exportUsers with an Admin policy', () => {
  test('exports demoted Admins as User on both targets', () => {
    const keycloak = exportUsers('keycloak', dump, { orgId: 'org-1', keepAdmins: ['operator'] }).users
    assert.deepEqual(keycloak.find((u) => u.username === 'operator').groups, ['/heka-admins'])
    assert.deepEqual(keycloak.find((u) => u.username === 'alice').groups, ['/heka-users'])

    const auth0 = exportUsers('auth0', dump, { orgId: 'org-1', keepAdmins: ['operator'] })
    assert.equal(auth0.find((u) => u.username === 'operator').app_metadata.heka_role, 'Admin')
    assert.equal(auth0.find((u) => u.username === 'demo').app_metadata.heka_role, 'User')
  })
})
