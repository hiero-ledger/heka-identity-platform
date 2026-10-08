#!/usr/bin/env node
/**
 * Exports heka-auth-service accounts in the import format of the OIDC provider that replaced it.
 *
 *   node export-users.mjs --report               --in auth-users.json [--org-id <id>] (--keep-admin <name>... | --keep-all-admins)
 *   node export-users.mjs --target keycloak      --in auth-users.json [--out users.keycloak.json] [--org-id <id>] (--keep-admin <name>... | --keep-all-admins) [--user <name>] [--without-passwords]
 *   node export-users.mjs --target auth0         --in auth-users.json [--out users.auth0.json]    [--org-id <id>] (--keep-admin <name>... | --keep-all-admins) [--user <name>] [--without-passwords] [--email-domain heka.invalid]
 *
 * `--in` is a JSON array of `auth_user` rows (`id`, `name`, `role`, `password`), or `-` for stdin; the README
 * shows the `psql` command that produces it. `--org-id` defaults to `ORG_ID`, the organization heka-auth-service
 * put into tokens of organization roles. Writes to stdout when `--out` is omitted.
 *
 * Every `Admin` acts in the one shared `Administration` wallet of heka-identity-service, and before #215 the web UI
 * registered every account as `Admin`. So when the dump contains `Admin` accounts, one of these is required:
 * `--keep-admin <name>` (repeatable) keeps only the named operators and exports every other `Admin` as `User`;
 * `--keep-all-admins` keeps every stored role. `--report` prints what each account becomes, and in which wallet,
 * without writing an import file.
 */
import * as fs from 'node:fs'
import { parseArgs } from 'node:util'

import { readUsers } from './read-dump.mjs'
import { exportTargets, exportUsers, formatMigrationReport, planMigration } from './user-export.mjs'

const { values } = parseArgs({
  options: {
    target: { type: 'string', short: 't' },
    in: { type: 'string', short: 'i' },
    out: { type: 'string', short: 'o' },
    'org-id': { type: 'string' },
    user: { type: 'string', short: 'u' },
    'email-domain': { type: 'string' },
    'without-passwords': { type: 'boolean', default: false },
    'keep-admin': { type: 'string', multiple: true },
    'keep-all-admins': { type: 'boolean', default: false },
    report: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
})

const usage = [
  `usage: export-users (--report | --target <${exportTargets.join('|')}>) --in <auth-users.json|-> (--keep-admin <name>... | --keep-all-admins)`,
  '                    [--out <file>] [--org-id <id>] [--user <name>] [--without-passwords] [--email-domain <domain>]',
].join('\n')

/**
 * The `Admin` policy from the flags: the names to keep, or `undefined` to keep every stored role.
 * Refuses to guess when the dump contains `Admin` accounts and neither flag is given.
 * @param {import('./user-export.mjs').AuthUser[]} users
 */
function adminPolicy(users) {
  const keepAdmins = values['keep-admin']
  if (keepAdmins && values['keep-all-admins']) {
    throw new Error('--keep-admin and --keep-all-admins exclude each other')
  }
  if (values['keep-all-admins']) return undefined
  if (keepAdmins) return keepAdmins
  const admins = users.filter((user) => user.role === 'Admin').map((user) => user.name)
  if (admins.length > 0) {
    throw new Error(
      [
        `${admins.length} account(s) have the stored role Admin: ${admins.join(', ')}.`,
        'Every Admin acts in the one shared Administration wallet of heka-identity-service.',
        'Name the real platform operators with --keep-admin <name> (repeatable; every other Admin is exported as User),',
        'or pass --keep-all-admins to keep every stored role. Run with --report first to see the result.',
      ].join('\n'),
    )
  }
  return []
}

function main() {
  if (values.help) {
    console.log(usage)
    return
  }
  const target = values.target
  if (!values.in || (!values.report && (!target || !exportTargets.includes(target)))) {
    throw new Error(usage)
  }

  const allUsers = readUsers(values.in)
  const keepAdmins = adminPolicy(allUsers)
  const orgId = values['org-id'] ?? process.env.ORG_ID ?? undefined

  if (values.report) {
    let plan = planMigration(allUsers, { orgId, keepAdmins })
    if (values.user) plan = plan.filter((user) => user.name === values.user)
    console.log(formatMigrationReport(plan))
    return
  }

  // The policy is validated against every account, then the export is narrowed to `--user`.
  let exported = exportUsers(target, allUsers, {
    orgId,
    keepAdmins,
    emailDomain: values['email-domain'],
    withoutPasswords: values['without-passwords'],
  })
  let count = allUsers.length
  if (values.user) {
    const keep = (user) => user.username === values.user
    exported = Array.isArray(exported) ? exported.filter(keep) : { ...exported, users: exported.users.filter(keep) }
    count = Array.isArray(exported) ? exported.length : exported.users.length
    if (count === 0) throw new Error(`user '${values.user}' not found`)
  }

  const output = JSON.stringify(exported, null, 2)
  if (values.out) {
    fs.writeFileSync(values.out, `${output}\n`, { encoding: 'utf8' })
    console.error(`exported ${count} user(s) for ${target} to ${values.out}`)
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
