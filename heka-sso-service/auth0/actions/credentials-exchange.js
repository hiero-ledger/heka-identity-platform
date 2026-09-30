/**
 * Auth0 Action, trigger `credentials-exchange` (Machine to Machine Flow).
 *
 * Adds the heka-identity-service claim contract to Client Credentials access tokens, e.g. the one
 * heka-sso-service uses. Machine-to-machine clients have no user, so the role and the optional
 * organization come from the application's metadata (Application → Settings → Application Metadata):
 *   heka_role   one of Admin, OrgAdmin, OrgManager, OrgMember, Issuer, Verifier, User (required)
 *   org_id      organization id (required for org roles, forbidden for Admin/User)
 *   heka_uid    stable Heka user id; defaults to the token subject `<client_id>@clients`
 *   heka_name   display name; defaults to the application name
 *
 * Secrets: HEKA_AUDIENCE (default `https://heka-identity`), HEKA_CLAIM_NAMESPACE (default `https://heka`).
 */

const HEKA_ROLES = ['Admin', 'OrgAdmin', 'OrgManager', 'OrgMember', 'Issuer', 'Verifier', 'User']

/**
 * @param {Event} event - Details about the client credentials exchange.
 * @param {CredentialsExchangeAPI} api - Interface to change the behavior of the exchange.
 */
exports.onExecuteCredentialsExchange = async (event, api) => {
  const secrets = event.secrets || {}
  const audience = secrets.HEKA_AUDIENCE || 'https://heka-identity'
  const namespace = (secrets.HEKA_CLAIM_NAMESPACE || 'https://heka').replace(/\/+$/, '')

  const requestedAudience = event.resource_server && event.resource_server.identifier
  if (requestedAudience !== audience) {
    return
  }

  const client = event.client || {}
  const metadata = client.metadata || {}

  if (!HEKA_ROLES.includes(metadata.heka_role)) {
    api.access.deny('invalid_client_metadata', `Application metadata heka_role must be one of ${HEKA_ROLES.join(', ')} to call ${audience}`)
    return
  }

  const claims = {
    [`${namespace}/roles`]: [metadata.heka_role],
    [`${namespace}/name`]: metadata.heka_name || client.name || client.client_id,
    [`${namespace}/heka_uid`]: metadata.heka_uid || `${client.client_id}@clients`,
  }
  if (metadata.org_id) {
    claims[`${namespace}/org_id`] = metadata.org_id
  }

  for (const [claim, value] of Object.entries(claims)) {
    api.accessToken.setCustomClaim(claim, value)
  }
}
