/**
 * Auth0 Action, trigger `post-login` (Login Flow).
 *
 * Adds the heka-identity-service claim contract to access tokens that were requested with the
 * Heka API audience, and gives first-time users the default Heka role. Access tokens with an
 * API audience only accept namespaced custom claims, hence the `https://heka/...` names; the
 * identity service reads them through its `OIDC_CLAIM_*` settings.
 *
 * Secrets (Action → Settings → Secrets):
 *   HEKA_AUDIENCE         API identifier the claims are for (default `https://heka-identity`)
 *   HEKA_CLAIM_NAMESPACE  claim prefix (default `https://heka`)
 *   HEKA_DEFAULT_ROLE     role for users without one (default `Admin`, what the web UI used to register with)
 *
 * Role resolution, first match wins: exactly one Heka role among the user's Auth0 roles
 * (`event.authorization.roles`), else `app_metadata.heka_role`, else HEKA_DEFAULT_ROLE, which is
 * then persisted to `app_metadata.heka_role`. The identity service requires exactly one role.
 */

const HEKA_ROLES = ['Admin', 'OrgAdmin', 'OrgManager', 'OrgMember', 'Issuer', 'Verifier', 'User']

/**
 * @param {Event} event - Details about the user and the context in which they are logging in.
 * @param {PostLoginAPI} api - Interface whose methods can be used to change the behavior of the login.
 */
exports.onExecutePostLogin = async (event, api) => {
  const secrets = event.secrets || {}
  const audience = secrets.HEKA_AUDIENCE || 'https://heka-identity'
  const namespace = (secrets.HEKA_CLAIM_NAMESPACE || 'https://heka').replace(/\/+$/, '')
  const defaultRole = secrets.HEKA_DEFAULT_ROLE || 'Admin'

  // Leave logins for other APIs / plain OIDC logins untouched (e.g. the OID4VP SSO demo).
  const requestedAudience = event.resource_server && event.resource_server.identifier
  if (requestedAudience !== audience) {
    return
  }

  const user = event.user || {}
  const appMetadata = user.app_metadata || {}
  const authorizationRoles = (event.authorization && event.authorization.roles) || []

  const hekaRolesFromAuth0 = authorizationRoles.filter((role) => HEKA_ROLES.includes(role))
  let role
  if (hekaRolesFromAuth0.length === 1) {
    role = hekaRolesFromAuth0[0]
  } else if (HEKA_ROLES.includes(appMetadata.heka_role)) {
    role = appMetadata.heka_role
  } else {
    role = defaultRole
    api.user.setAppMetadata('heka_role', role)
  }

  const hekaUid = appMetadata.heka_uid || user.user_id
  const name = user.username || user.nickname || user.name || user.email || user.user_id
  const orgId = appMetadata.org_id

  const claims = {
    [`${namespace}/roles`]: [role],
    [`${namespace}/name`]: name,
    [`${namespace}/heka_uid`]: hekaUid,
  }
  if (orgId) {
    claims[`${namespace}/org_id`] = orgId
  }

  for (const [claim, value] of Object.entries(claims)) {
    api.accessToken.setCustomClaim(claim, value)
    api.idToken.setCustomClaim(claim, value)
  }
}
