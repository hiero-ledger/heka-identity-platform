import { createHmac } from 'node:crypto'

import { OidcLoginConfig, SubStrategy } from '@config'

export type ClaimSet = Record<string, unknown>

const SUB_INPUT_SEPARATOR = String.fromCharCode(0x1f)

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify((value as ClaimSet)[key])}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value)
}

export function mapClaims(loginConfig: OidcLoginConfig, attributes: ClaimSet): ClaimSet {
  const mapped: ClaimSet = {}
  for (const [path, claimName] of Object.entries(loginConfig.claimMapping)) {
    if (attributes[path] !== undefined) {
      mapped[claimName] = attributes[path]
    }
  }
  return { ...loginConfig.staticClaims, ...mapped, login_config_id: loginConfig.id }
}

/**
 * `sub` computation per the login configuration's strategy. The MVP implements `derived`:
 * `HMAC(salt, client_id ‖ claim-set)` — stable for the same person *and* pairwise per RP.
 */
export function computeSub(loginConfig: OidcLoginConfig, clientId: string, claims: ClaimSet, hmacSalt: string): string {
  switch (loginConfig.subStrategy) {
    case SubStrategy.derived:
      return createHmac('sha256', hmacSalt)
        .update(`${clientId}${SUB_INPUT_SEPARATOR}${stableStringify(claims)}`)
        .digest('base64url')
    default:
      throw new Error(`sub strategy '${loginConfig.subStrategy}' is not implemented`)
  }
}
