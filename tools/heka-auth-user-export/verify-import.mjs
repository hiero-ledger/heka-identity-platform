#!/usr/bin/env node
/**
 * Checks, after the import, that every migrated account will act in the same heka-identity-service wallet as
 * planned: exactly one Heka role, the original id as `heka_uid`, the planned org id. Run it with the same dump and
 * the same `--org-id` / `--keep-admin` / `--keep-all-admins` flags as the export. Exits with 1 on any mismatch.
 *
 *   node verify-import.mjs --target keycloak --in auth-users.json [--org-id <id>] (--keep-admin <name>... | --keep-all-admins)
 *        [--keycloak-url http://localhost:8080] [--realm heka-platform] [--client heka-identity-web-ui] [--user <name>]
 *     Admin credentials of the master realm: KEYCLOAK_ADMIN_USERNAME, KEYCLOAK_ADMIN_PASSWORD (environment).
 *     Uses the admin API's example access token for the client, so no user password is needed.
 *
 *   node verify-import.mjs --target auth0 --in auth-users.json [--org-id <id>] (--keep-admin <name>... | --keep-all-admins)
 *        --auth0-domain <tenant>.<region>.auth0.com [--user <name>]
 *     Management API token with read:users and read:roles: AUTH0_MGMT_TOKEN (environment).
 *     Reads `app_metadata` and the Auth0 roles of `auth0|<id>`, as the import created them.
 */
import { parseArgs } from 'node:util'

import { readUsers } from './read-dump.mjs'
import { planMigration } from './user-export.mjs'
import { compareWithPlan, effectiveFromAuth0User, effectiveFromKeycloakClaims, formatVerifyReport } from './verify.mjs'

const { values } = parseArgs({
  options: {
    target: { type: 'string', short: 't' },
    in: { type: 'string', short: 'i' },
    'org-id': { type: 'string' },
    'keep-admin': { type: 'string', multiple: true },
    'keep-all-admins': { type: 'boolean', default: false },
    user: { type: 'string', short: 'u' },
    'keycloak-url': { type: 'string', default: 'http://localhost:8080' },
    realm: { type: 'string', default: 'heka-platform' },
    client: { type: 'string', default: 'heka-identity-web-ui' },
    'auth0-domain': { type: 'string' },
    help: { type: 'boolean', short: 'h', default: false },
  },
})

const usage =
  'usage: verify-import --target <keycloak|auth0> --in <auth-users.json> (--keep-admin <name>... | --keep-all-admins) [--org-id <id>] [--user <name>]\n' +
  '                     keycloak: [--keycloak-url <url>] [--realm <realm>] [--client <clientId>], KEYCLOAK_ADMIN_USERNAME / KEYCLOAK_ADMIN_PASSWORD\n' +
  '                     auth0:    --auth0-domain <domain>, AUTH0_MGMT_TOKEN'

/**
 * @param {string} url
 * @param {RequestInit} [init]
 */
async function fetchJson(url, init) {
  const response = await fetch(url, init)
  if (response.status === 404) return undefined
  if (!response.ok) throw new Error(`${init?.method ?? 'GET'} ${url.replace(/\?.*/, '')}: HTTP ${response.status}`)
  return response.json()
}

/** @param {import('./user-export.mjs').PlannedUser[]} plan */
async function verifyKeycloak(plan) {
  const base = values['keycloak-url'].replace(/\/+$/, '')
  const username = process.env.KEYCLOAK_ADMIN_USERNAME
  const password = process.env.KEYCLOAK_ADMIN_PASSWORD
  if (!username || !password) throw new Error('set KEYCLOAK_ADMIN_USERNAME and KEYCLOAK_ADMIN_PASSWORD (master realm admin)')

  const tokenResponse = await fetch(`${base}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    body: new URLSearchParams({ grant_type: 'password', client_id: 'admin-cli', username, password }),
  })
  const { access_token: adminToken } = /** @type {{ access_token?: string }} */ (await tokenResponse.json())
  if (!adminToken) throw new Error(`Keycloak admin login failed: HTTP ${tokenResponse.status}`)
  const headers = { Authorization: `Bearer ${adminToken}` }
  const realm = `${base}/admin/realms/${encodeURIComponent(values.realm)}`

  const clients = await fetchJson(`${realm}/clients?clientId=${encodeURIComponent(values.client)}`, { headers })
  const clientUuid = clients?.[0]?.id
  if (!clientUuid) throw new Error(`client '${values.client}' not found in realm '${values.realm}'`)

  const results = []
  for (const planned of plan) {
    const user = await fetchJson(`${realm}/users/${encodeURIComponent(planned.id)}`, { headers })
    if (!user) {
      results.push({ name: planned.name, ok: false, problems: [`no Keycloak user with id ${planned.id}`] })
      continue
    }
    const claims = await fetchJson(
      `${realm}/clients/${clientUuid}/evaluate-scopes/generate-example-access-token?userId=${encodeURIComponent(planned.id)}&scope=openid`,
      { headers },
    )
    results.push(compareWithPlan(planned, effectiveFromKeycloakClaims(claims ?? {})))
  }
  return results
}

/** @param {import('./user-export.mjs').PlannedUser[]} plan */
async function verifyAuth0(plan) {
  const domain = values['auth0-domain']?.replace(/^https?:\/\//, '').replace(/\/+$/, '')
  const token = process.env.AUTH0_MGMT_TOKEN
  if (!domain || !token) throw new Error('set --auth0-domain and AUTH0_MGMT_TOKEN (Management API, read:users and read:roles)')
  const headers = { Authorization: `Bearer ${token}` }

  const results = []
  for (const planned of plan) {
    const id = encodeURIComponent(`auth0|${planned.id}`)
    const user = await fetchJson(`https://${domain}/api/v2/users/${id}`, { headers })
    if (!user) {
      results.push({ name: planned.name, ok: false, problems: [`no Auth0 user auth0|${planned.id}`] })
      continue
    }
    const roles = (await fetchJson(`https://${domain}/api/v2/users/${id}/roles`, { headers })) ?? []
    results.push(compareWithPlan(planned, effectiveFromAuth0User(user, roles.map((role) => role.name))))
  }
  return results
}

async function main() {
  if (values.help) {
    console.log(usage)
    return
  }
  if (!values.in || !['keycloak', 'auth0'].includes(values.target ?? '')) throw new Error(usage)
  if (!values['keep-admin'] && !values['keep-all-admins']) {
    throw new Error('pass the same --keep-admin <name>... or --keep-all-admins as for the export')
  }
  if (values['keep-admin'] && values['keep-all-admins']) throw new Error('--keep-admin and --keep-all-admins exclude each other')

  let plan = planMigration(readUsers(values.in), {
    orgId: values['org-id'] ?? process.env.ORG_ID ?? undefined,
    keepAdmins: values['keep-all-admins'] ? undefined : values['keep-admin'],
  })
  if (values.user) {
    plan = plan.filter((user) => user.name === values.user)
    if (plan.length === 0) throw new Error(`user '${values.user}' not found`)
  }

  const results = values.target === 'keycloak' ? await verifyKeycloak(plan) : await verifyAuth0(plan)
  console.log(formatVerifyReport(results))
  if (results.some((result) => !result.ok)) process.exitCode = 1
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
