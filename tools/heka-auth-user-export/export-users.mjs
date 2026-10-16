#!/usr/bin/env node
/**
 * Exports heka-auth-service accounts in the import format of the OIDC provider that replaced it.
 *
 *   node export-users.mjs --target keycloak --in auth-users.json [--out users.keycloak.json] [--org-id <id>] [--user <name>] [--without-passwords]
 *   node export-users.mjs --target auth0    --in auth-users.json [--out users.auth0.json]    [--org-id <id>] [--user <name>] [--without-passwords] [--email-domain heka.invalid]
 *
 * `--in` is a JSON array of `auth_user` rows (`id`, `name`, `role`, `password`), or `-` for stdin; the README
 * shows the `psql` command that produces it. `--org-id` defaults to `ORG_ID`, the organization heka-auth-service
 * put into tokens of organization roles. Writes to stdout when `--out` is omitted.
 */
import * as fs from 'node:fs'
import { parseArgs } from 'node:util'

import { exportTargets, exportUsers } from './user-export.mjs'

const { values } = parseArgs({
  options: {
    target: { type: 'string', short: 't' },
    in: { type: 'string', short: 'i' },
    out: { type: 'string', short: 'o' },
    'org-id': { type: 'string' },
    user: { type: 'string', short: 'u' },
    'email-domain': { type: 'string' },
    'without-passwords': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
})

const usage = `usage: export-users --target <${exportTargets.join('|')}> --in <auth-users.json|-> [--out <file>] [--org-id <id>] [--user <name>] [--without-passwords] [--email-domain <domain>]`

/**
 * @param {string} source
 * @returns {import('./user-export.mjs').AuthUser[]}
 */
function readUsers(source) {
  const raw = fs.readFileSync(source === '-' ? 0 : source, 'utf8')
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`${source === '-' ? 'stdin' : source} is not valid JSON`)
  }
  // `psql -At` prints `json_agg` as a single line; an empty table yields "null".
  if (parsed === null) return []
  if (!Array.isArray(parsed)) {
    throw new Error(`${source === '-' ? 'stdin' : source} must be a JSON array of auth_user rows`)
  }
  return parsed
}

function main() {
  if (values.help) {
    console.log(usage)
    return
  }
  const target = values.target
  if (!target || !exportTargets.includes(target) || !values.in) {
    throw new Error(usage)
  }

  let users = readUsers(values.in)
  if (values.user) {
    users = users.filter((user) => user.name === values.user)
    if (users.length === 0) throw new Error(`user '${values.user}' not found`)
  }

  const output = JSON.stringify(
    exportUsers(target, users, {
      orgId: values['org-id'] ?? process.env.ORG_ID ?? undefined,
      emailDomain: values['email-domain'],
      withoutPasswords: values['without-passwords'],
    }),
    null,
    2,
  )
  if (values.out) {
    fs.writeFileSync(values.out, `${output}\n`, { encoding: 'utf8' })
    console.error(`exported ${users.length} user(s) for ${target} to ${values.out}`)
  } else {
    console.log(output)
  }
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
