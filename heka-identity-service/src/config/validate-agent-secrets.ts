import { z } from 'zod'

/**
 * Required cryptographic material for the Credo agent. These values are
 * NEVER allowed to fall back to compiled-in defaults because any default would
 * become a publicly known private key the moment the binary is distributed.
 * The service MUST fail to boot if any of them is missing or empty.
 */
export const agentSecretsSchema = z.object({
  INDY_ENDORSER_SEED: z.string().min(1, 'INDY_ENDORSER_SEED is required but not set'),
  INDY_BESU_ENDORSER_PRIVATE_KEY: z
    .string()
    .min(1, 'INDY_BESU_ENDORSER_PRIVATE_KEY is required but not set'),
  HEDERA_OPERATOR_KEY: z.string().min(1, 'HEDERA_OPERATOR_KEY is required but not set'),
  MDL_ISSUER_CERTIFICATE: z.string().min(1, 'MDL_ISSUER_CERTIFICATE is required but not set'),
  MDL_ISSUER_PRIVATE_KEY: z.string().min(1, 'MDL_ISSUER_PRIVATE_KEY is required but not set'),
})

/**
 * Declared explicitly (rather than `z.infer<typeof agentSecretsSchema>`) so that
 * consumers get a concrete type even when zod's type-resolver is unavailable
 * (e.g. during isolated tsc runs or in editors before `yarn install`).
 */
export interface RawAgentSecrets {
  INDY_ENDORSER_SEED: string
  INDY_BESU_ENDORSER_PRIVATE_KEY: string
  HEDERA_OPERATOR_KEY: string
  MDL_ISSUER_CERTIFICATE: string
  MDL_ISSUER_PRIVATE_KEY: string
}

export interface AgentSecrets extends RawAgentSecrets {
  /**
   * Parsed form of `MDL_ISSUER_PRIVATE_KEY`. The env var must contain a JSON
   * Web Key (JWK) object encoded as a JSON string.
   */
  MDL_ISSUER_PRIVATE_KEY_JWK: Record<string, string>
}

/**
 * Thrown when required agent secrets are missing, empty, or malformed.
 * Keeping a dedicated error class makes it trivial to distinguish
 * misconfiguration from unrelated runtime failures at boot.
 */
export class AgentSecretsValidationError extends Error {
  public readonly issues: string[]

  public constructor(issues: string[]) {
    super(
      [
        'Invalid agent secrets configuration — refusing to start with missing or default cryptographic material:',
        ...issues.map((i) => `  - ${i}`),
        '',
        'Provide these values via environment variables or a secret manager. See docs/setup.md for details.',
      ].join('\n'),
    )
    this.name = 'AgentSecretsValidationError'
    this.issues = issues
  }
}

/**
 * Validates that all required agent secrets are present in the supplied
 * environment and returns a fully-typed, parsed view of them.
 *
 * @throws {AgentSecretsValidationError} when any required variable is missing
 *   or empty, or when `MDL_ISSUER_PRIVATE_KEY` is not valid JSON.
 */
export function validateAgentSecrets(env: NodeJS.ProcessEnv = process.env): AgentSecrets {
  const result = agentSecretsSchema.safeParse({
    INDY_ENDORSER_SEED: env.INDY_ENDORSER_SEED ?? '',
    INDY_BESU_ENDORSER_PRIVATE_KEY: env.INDY_BESU_ENDORSER_PRIVATE_KEY ?? '',
    HEDERA_OPERATOR_KEY: env.HEDERA_OPERATOR_KEY ?? '',
    MDL_ISSUER_CERTIFICATE: env.MDL_ISSUER_CERTIFICATE ?? '',
    MDL_ISSUER_PRIVATE_KEY: env.MDL_ISSUER_PRIVATE_KEY ?? '',
  })

  if (!result.success) {
    throw new AgentSecretsValidationError(result.error.issues.map((issue) => issue.message))
  }

  const validated: RawAgentSecrets = result.data as RawAgentSecrets

  let mdlIssuerPrivateKeyJwk: Record<string, string>
  try {
    mdlIssuerPrivateKeyJwk = JSON.parse(validated.MDL_ISSUER_PRIVATE_KEY) as Record<string, string>
  } catch (err) {
    throw new AgentSecretsValidationError([
      `MDL_ISSUER_PRIVATE_KEY must be a JSON-encoded JWK (parse error: ${(err as Error).message})`,
    ])
  }

  if (typeof mdlIssuerPrivateKeyJwk !== 'object' || mdlIssuerPrivateKeyJwk === null) {
    throw new AgentSecretsValidationError([
      'MDL_ISSUER_PRIVATE_KEY must decode to a JWK object, not a primitive',
    ])
  }

  return {
    ...validated,
    MDL_ISSUER_PRIVATE_KEY_JWK: mdlIssuerPrivateKeyJwk,
  }
}
