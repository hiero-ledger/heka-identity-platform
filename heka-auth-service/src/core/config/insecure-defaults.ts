import { Logger } from '@nestjs/common'

/**
 * Publicly known default values for security-sensitive settings.
 *
 * They keep local development and tests working out of the box, but anyone can read them
 * from this repository. The config classes reference them (so there is a single source of
 * truth) and `assertSecureConfiguration` checks at startup that a deployment does not rely on them.
 */
export const INSECURE_DEFAULTS = {
  JWT_SECRET: 'test',
  DB_PASSWORD: 'heka1',
} as const

export type InsecureDefaultName = keyof typeof INSECURE_DEFAULTS

/**
 * Returns the names of sensitive variables that are unset, empty or equal to their publicly known default.
 */
export function findInsecureDefaults(env: Record<string, unknown>): InsecureDefaultName[] {
  return (Object.keys(INSECURE_DEFAULTS) as InsecureDefaultName[]).filter((name) => {
    const value = env[name]
    return value === undefined || value === '' || value === INSECURE_DEFAULTS[name]
  })
}

// NODE_ENV values under which publicly known defaults only produce a warning (compared after
// trimming and lowercasing). An unset or empty NODE_ENV is treated as development, matching the
// existing convention in heka-auth-service/src/common/utils/environment.utils.ts. Any other value,
// including typos or custom names such as "staging", is treated as production (fail closed).
const NON_PRODUCTION_NODE_ENVS = ['development', 'test']

// Returns `undefined` for a non-string value, which is unexpected from the environment and therefore not allowlisted.
function normalizeNodeEnv(nodeEnv: unknown): string | undefined {
  if (nodeEnv === undefined || nodeEnv === null) return ''
  return typeof nodeEnv === 'string' ? nodeEnv.trim().toLowerCase() : undefined
}

function isNonProductionEnv(normalizedNodeEnv: string | undefined): boolean {
  return (
    normalizedNodeEnv !== undefined &&
    (normalizedNodeEnv === '' || NON_PRODUCTION_NODE_ENVS.includes(normalizedNodeEnv))
  )
}

/**
 * Warns when publicly known default values are in use, and refuses to start unless `NODE_ENV`
 * is unset, empty, `development` or `test` (case-insensitive). Any other value is treated as production.
 * Called from the `validate` hook of the ConfigModule.
 */
export function assertSecureConfiguration(env: Record<string, unknown>): void {
  const names = findInsecureDefaults(env)
  if (names.length === 0) return

  const summary = `Insecure configuration: ${names.join(', ')} ${names.length === 1 ? 'is' : 'are'} unset or use publicly known default values.`

  const nodeEnv = normalizeNodeEnv(env.NODE_ENV)
  if (!isNonProductionEnv(nodeEnv)) {
    // The NODE_ENV value itself is not echoed, so the message only ever contains variable names.
    const unrecognized =
      nodeEnv === 'production'
        ? ''
        : ' NODE_ENV is set to a value other than development or test, so it is treated as production.'
    throw new Error(
      `${summary}${unrecognized} Set these environment variables explicitly before running in production.`,
    )
  }

  new Logger('Config').warn(
    `${summary} This is acceptable for local development only; the service will refuse to start unless NODE_ENV is unset, empty, development or test (case-insensitive).`,
  )
}
