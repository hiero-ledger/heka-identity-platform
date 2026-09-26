import { Logger } from '@nestjs/common'

/**
 * Publicly known default values for security-sensitive settings.
 *
 * They keep local development and tests working out of the box, but anyone can read them
 * from this repository. The config factories reference them (so there is a single source of
 * truth) and `assertSecureConfiguration` checks at startup that a deployment does not rely on them.
 */
export const INSECURE_DEFAULTS = {
  JWT_SECRET: 'test',
  MIKRO_ORM_PASSWORD: 'heka1',
  WALLET_POSTGRES_PASSWORD: 'heka1',
  INDY_ENDORSER_SEED: 'afjdemoverysecure000000000000002',
  INDY_BESU_ENDORSER_PRIVATE_KEY: 'c87509a1c067bbde78beb793e6fa76530b6382a4c0241e5e4a9ec0a0f44dc0d3',
  HEDERA_OPERATOR_KEY:
    '302e020100300506032b6570042204209f54b75b6238ced43e41b1463999cb40bf2f7dd2c9fd4fd3ef780027c016a138',
  MDL_ISSUER_PRIVATE_KEY:
    '{"kty":"EC","x":"1nIrm3O9VX8MdPrKWMhqqV0QMS4UtxKj6uUc8IdGE2c","y":"0rFsou10Ddx6BNS5_Uw7TiB70slvBMq_fDJVhgQRf74","crv":"P-256","d":"ioXmEeGGMTLWF8AZwFwufaR5e_oGTfxR2IrZSQ9niLA","kid":"4f138202-31fb-4f13-b779-8f61b2bef253"}',
  FILE_STORAGE_MINIO_SECRET_KEY: 'secret_key',
} as const

export type InsecureDefaultName = keyof typeof INSECURE_DEFAULTS

export const DEFAULT_DID_METHODS = ['indy', 'key', 'hedera']

export function parseDidMethods(env: Record<string, unknown>): string[] {
  const value = env.DID_METHODS
  return typeof value === 'string' && value.length > 0 ? value.split(',') : DEFAULT_DID_METHODS
}

// Variables checked for every deployment. mDL issuance (`mso_mdoc`) is always enabled via
// `credentialsConfiguration` in `agent.ts` and the Askar wallet always uses PostgreSQL,
// so the mDL issuer key and the wallet DB password are unconditional as well.
const UNCONDITIONAL: InsecureDefaultName[] = [
  'JWT_SECRET',
  'MIKRO_ORM_PASSWORD',
  'WALLET_POSTGRES_PASSWORD',
  'MDL_ISSUER_PRIVATE_KEY',
]

// Variables checked only when the corresponding integration is enabled.
const CONDITIONAL: Array<{ name: InsecureDefaultName; isEnabled: (env: Record<string, unknown>) => boolean }> = [
  { name: 'INDY_ENDORSER_SEED', isEnabled: (env) => parseDidMethods(env).includes('indy') },
  { name: 'INDY_BESU_ENDORSER_PRIVATE_KEY', isEnabled: (env) => parseDidMethods(env).includes('indybesu') },
  { name: 'HEDERA_OPERATOR_KEY', isEnabled: (env) => parseDidMethods(env).includes('hedera') },
  { name: 'FILE_STORAGE_MINIO_SECRET_KEY', isEnabled: (env) => env.FILE_STORAGE_TARGET === 'minio' },
]

function isInsecure(env: Record<string, unknown>, name: InsecureDefaultName): boolean {
  const value = env[name]
  return value === undefined || value === '' || value === INSECURE_DEFAULTS[name]
}

/**
 * Returns the names of sensitive variables that are unset, empty or equal to their publicly known default.
 * Variables of integrations that are not enabled by the given environment are ignored.
 */
export function findInsecureDefaults(env: Record<string, unknown>): InsecureDefaultName[] {
  const enabledConditional = CONDITIONAL.filter(({ isEnabled }) => isEnabled(env)).map(({ name }) => name)
  return [...UNCONDITIONAL, ...enabledConditional].filter((name) => isInsecure(env, name))
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
 * Intended to be used as the `validate` hook of `ConfigModule.forRoot`.
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
