/**
 * Compares what the OIDC provider will put into a migrated user's token with the migration plan
 * (`planMigration` in `user-export.mjs`). Pure functions; `verify-import.mjs` fetches the provider data.
 *
 * A user passes when heka-identity-service would put them into the planned wallet: exactly one Heka role,
 * the planned one, the original id as `heka_uid` and the planned org id (none for `Admin` and `User`).
 */
import { hekaRoles, walletIdFor } from './user-export.mjs'

/**
 * @typedef {import('./user-export.mjs').PlannedUser} PlannedUser
 * @typedef {{ role?: string, hekaUid?: string, orgId?: string, problems: string[] }} Effective
 * @typedef {{ name: string, ok: boolean, wallet?: string, problems: string[] }} VerifyResult
 */

/**
 * @param {PlannedUser} planned
 * @param {Effective} effective
 * @returns {VerifyResult}
 */
export function compareWithPlan(planned, effective) {
  const problems = [...effective.problems]
  if (effective.role !== planned.role) problems.push(`role is ${effective.role ?? 'missing'}, planned ${planned.role}`)
  if (effective.hekaUid !== planned.id) problems.push(`heka_uid is ${effective.hekaUid ?? 'missing'}, planned ${planned.id}`)
  if ((effective.orgId ?? undefined) !== planned.orgId) {
    problems.push(`org_id is ${effective.orgId ?? 'missing'}, planned ${planned.orgId ?? 'none'}`)
  }
  let wallet
  if (effective.role && hekaRoles.includes(effective.role) && effective.hekaUid) {
    try {
      wallet = walletIdFor(effective.role, effective.hekaUid, effective.orgId)
    } catch {
      // unknown role: already reported
    }
  }
  return { name: planned.name, ok: problems.length === 0, ...(wallet ? { wallet } : {}), problems }
}

/**
 * Keycloak: the claims of an access token for the Heka client (the admin API's example token).
 * @param {Record<string, unknown>} claims
 * @returns {Effective}
 */
export function effectiveFromKeycloakClaims(claims) {
  const problems = []
  const raw = claims.roles
  const values = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : []
  const roles = values.filter((value) => hekaRoles.includes(value))
  if (roles.length !== 1) problems.push(`token carries ${roles.length} Heka roles (${roles.join(', ') || 'none'}), exactly one is required`)
  return {
    role: roles.length === 1 ? roles[0] : undefined,
    hekaUid: typeof claims.heka_uid === 'string' ? claims.heka_uid : undefined,
    orgId: typeof claims.org_id === 'string' && claims.org_id !== '' ? claims.org_id : undefined,
    problems,
  }
}

/**
 * Auth0: what the post-login Action (`heka-sso-service/auth0/actions/post-login.js`) will emit for this user.
 * Exactly one Auth0 role with a Heka name wins over `app_metadata.heka_role`; a user with neither only gets the
 * Action's default role at the next login, which is reported as a problem here.
 * @param {{ user_id?: string, app_metadata?: Record<string, unknown> }} user
 * @param {string[]} auth0RoleNames
 * @returns {Effective}
 */
export function effectiveFromAuth0User(user, auth0RoleNames) {
  const problems = []
  const appMetadata = user.app_metadata ?? {}
  const fromRoles = auth0RoleNames.filter((name) => hekaRoles.includes(name))
  let role
  if (fromRoles.length === 1) {
    role = fromRoles[0]
    if (appMetadata.heka_role && appMetadata.heka_role !== role) {
      problems.push(`Auth0 role ${role} overrides app_metadata.heka_role ${String(appMetadata.heka_role)}`)
    }
  } else if (hekaRoles.includes(/** @type {string} */ (appMetadata.heka_role))) {
    role = /** @type {string} */ (appMetadata.heka_role)
  } else {
    problems.push('no Heka role: the post-login Action would assign HEKA_DEFAULT_ROLE at the next login')
  }
  return {
    role,
    hekaUid: typeof appMetadata.heka_uid === 'string' ? appMetadata.heka_uid : user.user_id,
    orgId: typeof appMetadata.org_id === 'string' && appMetadata.org_id !== '' ? appMetadata.org_id : undefined,
    problems,
  }
}

/**
 * @param {VerifyResult[]} results
 */
export function formatVerifyReport(results) {
  const lines = results.map((result) =>
    result.ok ? `OK        ${result.name} -> ${result.wallet}` : `MISMATCH  ${result.name}: ${result.problems.join('; ')}`,
  )
  const failed = results.filter((result) => !result.ok).length
  lines.push('', `${results.length - failed} of ${results.length} account(s) match the migration plan`)
  return lines.join('\n')
}
