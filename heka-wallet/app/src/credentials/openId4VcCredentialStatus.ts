import { CredoError } from '@credo-ts/core'
import { Config } from 'react-native-config'

/**
 * Exact messages from @credo-ts/core@0.5.19 W3C VC verification when credential status checks apply.
 * If Credo is upgraded, re-sync with:
 * - modules/vc/jwt-vc/W3cJwtCredentialService
 * - modules/vc/data-integrity/W3cJsonLdCredentialService
 */
const CREDO_JWT_VC_CREDENTIAL_STATUS_UNSUPPORTED =
  'Verifying credential status is not supported for JWT VCs'
const CREDO_JSONLD_CREDENTIAL_STATUS_UNSUPPORTED =
  'Verifying credential status for JSON-LD credentials is currently not supported'

/** Prefix of CredoError when W3C credential verification fails (OpenId4VciHolderService). */
const CREDO_W3C_VALIDATE_PREFIX = 'Failed to validate credential, error = '

/**
 * @sd-jwt/sd-jwt-vc status handling (via @sd-jwt/utils).
 * "Status is not valid" means a non-zero status list entry (e.g. suspended/revoked).
 */
const SDJWT_STATUS_FAILURE_MESSAGES = new Set(['Status is not valid', 'Status list is expired'])

/** Matches `SDJWTException` from `@sd-jwt/utils` without taking a direct package dependency. */
function isSdJwtException(error: unknown): error is Error {
  return error instanceof Error && error.name === 'SDJWTException'
}

/** Credo SdJwtVcService when the status list HTTP response is not OK. */
const CREDO_STATUS_LIST_HTTP_ERROR = /^Received invalid response with status \d+ when fetching status list from /

/** Default @sd-jwt/sd-jwt-vc fetcher when the status list HTTP response is not OK. */
const SDJWT_STATUS_LIST_HTTP_ERROR = /^Error fetching status list: /

function* eachErrorInChain(error: unknown): Generator<unknown> {
  let current: unknown = error
  const seen = new Set<unknown>()

  while (current !== null && current !== undefined && !seen.has(current)) {
    seen.add(current)
    yield current

    if (current instanceof Error && 'cause' in current) {
      const { cause } = current as Error & { cause?: unknown }
      if (cause === undefined || cause === null) {
        break
      }
      current = cause
    } else {
      break
    }
  }
}

function isCredoStatusListHttpMessage(message: string): boolean {
  return CREDO_STATUS_LIST_HTTP_ERROR.test(message)
}

function isSdJwtStatusListHttpMessage(message: string): boolean {
  return SDJWT_STATUS_LIST_HTTP_ERROR.test(message)
}

function isCredoWrappedW3cCredentialStatusMessage(message: string): boolean {
  if (!message.startsWith(CREDO_W3C_VALIDATE_PREFIX)) {
    return false
  }
  const inner = message.slice(CREDO_W3C_VALIDATE_PREFIX.length)
  return (
    inner === CREDO_JWT_VC_CREDENTIAL_STATUS_UNSUPPORTED ||
    inner === CREDO_JSONLD_CREDENTIAL_STATUS_UNSUPPORTED
  )
}

/**
 * Whether OpenID4VCI `requestCredentials` should verify credential status (revocation, status lists, etc.).
 * Default is true for production trust. In __DEV__ only, set env `DISABLE_OPENID4VC_CREDENTIAL_STATUS_VERIFY=true`
 * to opt out for local issuer labs that lack status infrastructure.
 */
export function shouldVerifyOpenId4VcCredentialStatus(): boolean {
  if (
    typeof __DEV__ !== 'undefined' &&
    __DEV__ &&
    String(Config.DISABLE_OPENID4VC_CREDENTIAL_STATUS_VERIFY ?? '').toLowerCase() === 'true'
  ) {
    return false
  }
  return true
}

/**
 * Detects credential-status or status-list failures using error types and stable messages from
 * `@credo-ts/core` / `@sd-jwt/*` — not ad-hoc substring matching on arbitrary issuer text.
 */
export function isOpenId4VcCredentialStatusFailure(error: unknown): boolean {
  if (error === null || error === undefined) {
    return false
  }

  for (const err of eachErrorInChain(error)) {
    if (isSdJwtException(err) && SDJWT_STATUS_FAILURE_MESSAGES.has(err.message)) {
      return true
    }

    if (err instanceof CredoError) {
      if (err.message === CREDO_JWT_VC_CREDENTIAL_STATUS_UNSUPPORTED) {
        return true
      }
      if (err.message === CREDO_JSONLD_CREDENTIAL_STATUS_UNSUPPORTED) {
        return true
      }
      if (isCredoStatusListHttpMessage(err.message)) {
        return true
      }
      if (isCredoWrappedW3cCredentialStatusMessage(err.message)) {
        return true
      }
    }

    if (err instanceof Error && isSdJwtStatusListHttpMessage(err.message)) {
      return true
    }
  }

  return false
}
