/**
 * Turns heka-auth-service accounts into the import formats of the OIDC providers that replaced it
 * (Keycloak partial import, Auth0 bulk import). Pure functions over `auth_user` rows; the CLI in
 * `export-users.mjs` reads a JSON dump of that table and writes the files.
 *
 * Every export keeps the original user id as the provider-independent Heka user id (`heka_uid`),
 * so the identity-service tenant of a migrated user (derived from role, user id and org id) is the
 * same before and after the migration and on both providers.
 *
 * @typedef {'keycloak' | 'auth0'} ExportTarget
 * @typedef {{ id: string, name: string, role: string, password: string }} AuthUser
 *   `password` is the encoded argon2 hash stored by the `argon2` package, e.g. `$argon2id$v=19$m=65536,t=3,p=4$<salt>$<hash>`.
 * @typedef {{ orgId?: string, emailDomain?: string, withoutPasswords?: boolean }} ExportOptions
 *   `orgId`: `org_id` given to users with an organization role (heka-auth-service's `ORG_ID`).
 *   `emailDomain`: Auth0 only, domain of the synthesized e-mail addresses.
 *   `withoutPasswords`: emit the users without their password hash; they must set a new one.
 */

/** @type {ExportTarget[]} */
export const exportTargets = ['keycloak', 'auth0']

export const hekaRoles = ['Admin', 'OrgAdmin', 'OrgManager', 'OrgMember', 'Issuer', 'Verifier', 'User']

/** Roles whose tenant is an organization; heka-auth-service put the deployment's `ORG_ID` in their tokens. */
export const orgRoles = new Set(['OrgAdmin', 'OrgManager', 'OrgMember', 'Issuer', 'Verifier'])

const ARGON2_PATTERN =
  /^\$(argon2(?:id|i|d))\$v=(\d+)\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+=*)\$([A-Za-z0-9+/]+=*)$/

/**
 * Parses the PHC-style encoded hash produced by the `argon2` package (and everything else that follows the reference format).
 * @param {string} encoded
 * @returns {{ variant: string, version: number, memoryKiB: number, iterations: number, parallelism: number, salt: Buffer, hash: Buffer }}
 */
export function parseArgon2Hash(encoded) {
  const match = ARGON2_PATTERN.exec(encoded)
  if (!match) {
    throw new Error('password is not an encoded argon2 hash ($argon2id$v=19$m=...,t=...,p=...$<salt>$<hash>)')
  }
  const [, variant, version, memory, iterations, parallelism, salt, hash] = match
  return {
    variant,
    version: parseInt(version, 10),
    memoryKiB: parseInt(memory, 10),
    iterations: parseInt(iterations, 10),
    parallelism: parseInt(parallelism, 10),
    salt: Buffer.from(salt, 'base64'),
    hash: Buffer.from(hash, 'base64'),
  }
}

/**
 * @param {string} role
 * @param {string} user
 */
export function assertHekaRole(role, user) {
  if (!hekaRoles.includes(role)) {
    throw new Error(`user '${user}' has unknown role '${role}'`)
  }
}

/**
 * @param {string} role
 * @param {string} user
 * @param {string | undefined} orgId
 */
const orgIdFor = (role, user, orgId) => {
  if (!orgRoles.has(role)) return undefined
  if (!orgId) {
    throw new Error(`user '${user}' has organization role '${role}' but no org id is configured (--org-id / ORG_ID)`)
  }
  return orgId
}

/**
 * @param {AuthUser} user
 */
const validateUser = (user) => {
  for (const field of ['id', 'name', 'role', 'password']) {
    if (typeof user?.[field] !== 'string' || user[field].length === 0) {
      throw new Error(`user ${JSON.stringify(user?.name ?? user?.id ?? user)} has no '${field}'`)
    }
  }
}

// --- Keycloak ---------------------------------------------------------------------------------

/** Keycloak's argon2 provider ids for the encoded variant and version. */
const keycloakArgon2Type = { argon2id: 'id', argon2i: 'i', argon2d: 'd' }
const keycloakArgon2Version = { 19: '1.3', 16: '1.0' }

export const keycloakIdentityClient = 'heka-identity-service'
/** The realm's default group, carrying `heka-identity-service.User`. */
export const keycloakDefaultGroup = '/heka-users'
/** The realm's operator group, carrying `heka-identity-service.Admin`; not a default group. */
export const keycloakAdminGroup = '/heka-admins'

/**
 * The credential representation Keycloak's built-in `argon2` hash provider verifies:
 * `secretData` = base64 hash and salt, `credentialData` = iterations and the other parameters.
 * @param {string} encoded
 */
export function toKeycloakCredential(encoded) {
  const hash = parseArgon2Hash(encoded)
  const type = keycloakArgon2Type[hash.variant]
  const version = keycloakArgon2Version[hash.version]
  if (!type || !version) {
    throw new Error(`argon2 variant '${hash.variant}' version ${hash.version} is not supported by Keycloak`)
  }
  return {
    type: 'password',
    userLabel: 'Migrated from heka-auth-service',
    secretData: JSON.stringify({
      value: hash.hash.toString('base64'),
      salt: hash.salt.toString('base64'),
      additionalParameters: {},
    }),
    credentialData: JSON.stringify({
      hashIterations: hash.iterations,
      algorithm: 'argon2',
      additionalParameters: {
        hashLength: [String(hash.hash.length)],
        memory: [String(hash.memoryKiB)],
        type: [type],
        version: [version],
        parallelism: [String(hash.parallelism)],
      },
    }),
  }
}

/**
 * @param {AuthUser} user
 * @param {ExportOptions} [options]
 */
export function toKeycloakUser(user, options = {}) {
  validateUser(user)
  assertHekaRole(user.role, user.name)
  const orgId = orgIdFor(user.role, user.name, options.orgId)

  const result = {
    id: user.id,
    username: user.name,
    enabled: true,
    emailVerified: false,
    attributes: { heka_uid: [user.id], ...(orgId ? { org_id: [orgId] } : {}) },
  }
  if (options.withoutPasswords) {
    result.requiredActions = ['UPDATE_PASSWORD']
  } else {
    result.credentials = [toKeycloakCredential(user.password)]
  }
  // Exactly one Heka role per user, so an imported user is in at most one of the two groups and holds
  // a client role only when it is in neither.
  if (user.role === 'Admin') {
    result.groups = [keycloakAdminGroup]
  } else if (user.role === 'User') {
    result.groups = [keycloakDefaultGroup]
  } else {
    // Organization roles are client roles of `heka-identity-service`; the user is not in `heka-users`.
    result.groups = []
    result.clientRoles = { [keycloakIdentityClient]: [user.role] }
  }
  return result
}

/**
 * @param {AuthUser[]} users
 * @param {ExportOptions} [options]
 */
export function toKeycloakPartialImport(users, options = {}) {
  return { ifResourceExists: 'SKIP', users: users.map((user) => toKeycloakUser(user, options)) }
}

// --- Auth0 ------------------------------------------------------------------------------------

export const auth0DefaultEmailDomain = 'heka.invalid'

/**
 * heka-auth-service accounts have no e-mail, which Auth0 requires: `<username>@<domain>` with
 * characters outside the local-part alphabet replaced.
 * @param {string} username
 * @param {string} [domain]
 */
export function auth0PlaceholderEmail(username, domain = auth0DefaultEmailDomain) {
  const local = username.toLowerCase().replace(/[^a-z0-9._+-]/g, '_')
  return `${local}@${domain}`
}

/**
 * @param {AuthUser} user
 * @param {ExportOptions} [options]
 */
export function toAuth0User(user, options = {}) {
  validateUser(user)
  assertHekaRole(user.role, user.name)
  const orgId = orgIdFor(user.role, user.name, options.orgId)

  const result = {
    // Becomes `auth0|<id>`; the original id also travels in `app_metadata.heka_uid`.
    user_id: user.id,
    email: auth0PlaceholderEmail(user.name, options.emailDomain),
    email_verified: false,
    username: user.name,
    name: user.name,
    app_metadata: { heka_uid: user.id, heka_role: user.role, ...(orgId ? { org_id: orgId } : {}) },
  }
  if (!options.withoutPasswords) {
    parseArgon2Hash(user.password) // fail early on a hash Auth0 would reject
    result.custom_password_hash = { algorithm: 'argon2', hash: { value: user.password } }
  }
  return result
}

/**
 * @param {AuthUser[]} users
 * @param {ExportOptions} [options]
 */
export function toAuth0Import(users, options = {}) {
  return users.map((user) => toAuth0User(user, options))
}

// --- Migration plan ---------------------------------------------------------------------------

/**
 * The heka-identity-service wallet a token with this role, user id and org id acts in. Mirrors `getWalletId`
 * in `heka-identity-service/src/utils/auth/index.ts` (since #215 every `Admin` shares `Administration`).
 * @param {string} role
 * @param {string} userId
 * @param {string | undefined} orgId
 */
export function walletIdFor(role, userId, orgId) {
  switch (role) {
    case 'Admin':
      return 'Administration'
    case 'User':
      return `User_${userId}`
    case 'OrgAdmin':
    case 'OrgManager':
    case 'OrgMember':
      return `Organization_${orgId}`
    case 'Issuer':
    case 'Verifier':
      return `${role}_${userId}_in_Organization_${orgId}`
    default:
      throw new Error(`unknown role '${role}'`)
  }
}

/**
 * The `Admin` policy of a migration: `keepAdmins` names the accounts that stay `Admin`; every other `Admin` becomes
 * `User`, because every `Admin` acts in the one shared `Administration` wallet and heka-auth-service let the web UI
 * register everyone as `Admin` before #215. `undefined` keeps every stored role.
 * @param {AuthUser[]} users
 * @param {string[] | undefined} keepAdmins
 * @returns {AuthUser[]}
 */
export function applyAdminPolicy(users, keepAdmins) {
  if (keepAdmins === undefined) return users
  for (const name of keepAdmins) {
    const user = users.find((candidate) => candidate.name === name)
    if (!user) throw new Error(`--keep-admin '${name}': no such user`)
    if (user.role !== 'Admin') throw new Error(`--keep-admin '${name}': the user's stored role is '${user.role}', not Admin`)
  }
  return users.map((user) => (user.role === 'Admin' && !keepAdmins.includes(user.name) ? { ...user, role: 'User' } : user))
}

/**
 * @typedef {{ orgId?: string, keepAdmins?: string[] }} PlanOptions
 * @typedef {{ id: string, name: string, storedRole: string, role: string, orgId?: string, wallet: string, demoted: boolean }} PlannedUser
 */

/**
 * What each account becomes after the migration: its role (after the `Admin` policy), its org id and the wallet it
 * then acts in. A demoted `Admin` starts in an empty `User_<id>` wallet; its earlier data stays in `Administration_<id>`
 * (deployments before #215) or in the shared `Administration` wallet.
 * @param {AuthUser[]} users
 * @param {PlanOptions} [options]
 * @returns {PlannedUser[]}
 */
export function planMigration(users, options = {}) {
  const migrated = applyAdminPolicy(users, options.keepAdmins)
  return migrated.map((user, index) => {
    assertHekaRole(user.role, user.name)
    const orgId = orgIdFor(user.role, user.name, options.orgId)
    return {
      id: user.id,
      name: user.name,
      storedRole: users[index].role,
      role: user.role,
      ...(orgId ? { orgId } : {}),
      wallet: walletIdFor(user.role, user.id, orgId),
      demoted: users[index].role !== user.role,
    }
  })
}

/**
 * Human-readable migration report: one line per account and a summary.
 * @param {PlannedUser[]} plan
 */
export function formatMigrationReport(plan) {
  const header = ['name', 'stored role', 'role', 'org_id', 'wallet after migration']
  const rows = plan.map((user) => [
    user.name,
    user.storedRole,
    user.demoted ? `${user.role} (demoted)` : user.role,
    user.orgId ?? '',
    user.wallet,
  ])
  const widths = header.map((title, column) => Math.max(title.length, ...rows.map((row) => row[column].length)))
  const line = (cells) => cells.map((cell, column) => cell.padEnd(widths[column])).join('  ').trimEnd()

  const count = (predicate) => plan.filter(predicate).length
  const admins = plan.filter((user) => user.role === 'Admin').map((user) => user.name)
  const summary = [
    `${plan.length} account(s): ${hekaRoles.map((role) => `${role} ${count((user) => user.role === role)}`).join(', ')}`,
    `Admin after migration (shared Administration wallet): ${admins.length ? admins.join(', ') : 'none'}`,
    `Demoted from Admin to User (start in an empty User_<id> wallet): ${count((user) => user.demoted)}`,
  ]
  return [line(header), line(widths.map((width) => '-'.repeat(width))), ...rows.map(line), '', ...summary].join('\n')
}

// --- Entry point ------------------------------------------------------------------------------

/**
 * @param {ExportTarget} target
 * @param {AuthUser[]} users
 * @param {ExportOptions & { keepAdmins?: string[] }} [options]
 */
export function exportUsers(target, users, options = {}) {
  const migrated = applyAdminPolicy(users, options.keepAdmins)
  switch (target) {
    case 'keycloak':
      return toKeycloakPartialImport(migrated, options)
    case 'auth0':
      return toAuth0Import(migrated, options)
    default:
      throw new Error(`unknown target '${String(target)}' (expected ${exportTargets.join(' | ')})`)
  }
}
