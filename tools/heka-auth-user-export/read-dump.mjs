import * as fs from 'node:fs'

/**
 * Reads the JSON dump of heka-auth-service's `auth_user` table (see the README), or stdin for `-`.
 * @param {string} source
 * @returns {import('./user-export.mjs').AuthUser[]}
 */
export function readUsers(source) {
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
