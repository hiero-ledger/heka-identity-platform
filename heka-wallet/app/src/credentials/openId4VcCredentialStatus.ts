import { Config } from 'react-native-config'

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
 * Best-effort detection of Credo / issuer errors related to credential status or revocation,
 * for user-facing messaging when status verification is enabled.
 */
export function isOpenId4VcCredentialStatusFailure(error: unknown): boolean {
  if (error === null || error === undefined) {
    return false
  }

  const message =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? `${error.message} ${'cause' in error && error.cause instanceof Error ? error.cause.message : ''}`
        : String(error)

  const normalized = message.toLowerCase()
  const patterns = [
    'revok',
    'revocation',
    'credential status',
    'status list',
    'statuslist',
    'invalid status',
    'credential is not active',
    'not active',
    'has been revoked',
    'verification failed',
    'status verification',
  ]

  return patterns.some((p) => normalized.includes(p))
}
