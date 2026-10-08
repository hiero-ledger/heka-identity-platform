import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { compareWithPlan, effectiveFromAuth0User, effectiveFromKeycloakClaims, formatVerifyReport } from './verify.mjs'

const issuer = { id: 'i1', name: 'doctor', storedRole: 'Issuer', role: 'Issuer', orgId: 'org-1', wallet: 'Issuer_i1_in_Organization_org-1', demoted: false }
const demoted = { id: 'a2', name: 'alice', storedRole: 'Admin', role: 'User', wallet: 'User_a2', demoted: true }

describe('Keycloak claims', () => {
  test('pass when they carry the planned role, heka_uid and org id', () => {
    const result = compareWithPlan(issuer, effectiveFromKeycloakClaims({ roles: ['Issuer', 'offline_access'], heka_uid: 'i1', org_id: 'org-1' }))

    assert.deepEqual(result, { name: 'doctor', ok: true, wallet: 'Issuer_i1_in_Organization_org-1', problems: [] })
  })

  test('fail with two Heka roles, e.g. the default group added on top of a client role', () => {
    const result = compareWithPlan(issuer, effectiveFromKeycloakClaims({ roles: ['Issuer', 'User'], heka_uid: 'i1', org_id: 'org-1' }))

    assert.equal(result.ok, false)
    assert.match(result.problems[0], /2 Heka roles \(Issuer, User\), exactly one is required/)
  })

  test('fail when a demoted Admin is still Admin, or an org id is missing or extra', () => {
    assert.match(compareWithPlan(demoted, effectiveFromKeycloakClaims({ roles: ['Admin'], heka_uid: 'a2' })).problems.join(), /role is Admin, planned User/)
    assert.match(compareWithPlan(issuer, effectiveFromKeycloakClaims({ roles: ['Issuer'], heka_uid: 'i1' })).problems.join(), /org_id is missing, planned org-1/)
    assert.match(
      compareWithPlan(demoted, effectiveFromKeycloakClaims({ roles: ['User'], heka_uid: 'a2', org_id: 'org-1' })).problems.join(),
      /org_id is org-1, planned none/,
    )
  })

  test('fail when heka_uid is not the original id, which would mean a new, empty wallet', () => {
    const result = compareWithPlan(demoted, effectiveFromKeycloakClaims({ roles: ['User'], heka_uid: 'new-id' }))

    assert.match(result.problems.join(), /heka_uid is new-id, planned a2/)
    assert.equal(result.wallet, 'User_new-id')
  })
})

describe('Auth0 users', () => {
  test('use app_metadata when the user has no Heka-named Auth0 role', () => {
    const effective = effectiveFromAuth0User({ user_id: 'auth0|i1', app_metadata: { heka_role: 'Issuer', heka_uid: 'i1', org_id: 'org-1' } }, ['Some role'])

    assert.equal(compareWithPlan(issuer, effective).ok, true)
  })

  test('report an Auth0 role that overrides app_metadata', () => {
    const effective = effectiveFromAuth0User({ user_id: 'auth0|a2', app_metadata: { heka_role: 'User', heka_uid: 'a2' } }, ['Admin'])
    const result = compareWithPlan(demoted, effective)

    assert.equal(effective.role, 'Admin')
    assert.equal(result.ok, false)
    assert.match(result.problems.join(), /Auth0 role Admin overrides app_metadata.heka_role User/)
  })

  test('fall back to app_metadata with two Heka-named Auth0 roles, like the post-login Action', () => {
    assert.equal(effectiveFromAuth0User({ app_metadata: { heka_role: 'User', heka_uid: 'a2' } }, ['Admin', 'Issuer']).role, 'User')
  })

  test('report a user without any Heka role', () => {
    const result = compareWithPlan(demoted, effectiveFromAuth0User({ user_id: 'auth0|a2', app_metadata: { heka_uid: 'a2' } }, []))

    assert.match(result.problems.join(), /no Heka role/)
  })
})

describe('formatVerifyReport', () => {
  test('lists every account and counts the matches', () => {
    const report = formatVerifyReport([
      { name: 'doctor', ok: true, wallet: 'Issuer_i1_in_Organization_org-1', problems: [] },
      { name: 'alice', ok: false, problems: ['role is Admin, planned User'] },
    ])

    assert.ok(report.includes('OK        doctor -> Issuer_i1_in_Organization_org-1'))
    assert.ok(report.includes('MISMATCH  alice: role is Admin, planned User'))
    assert.ok(report.includes('1 of 2 account(s) match the migration plan'))
  })
})
