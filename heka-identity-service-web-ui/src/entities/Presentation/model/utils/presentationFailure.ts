import { PresentationFailureReason } from '../types/presentation';

// Credo's SD-JWT VC verification fails with "Status is not valid" when the status list entry
// of the credential is set (this service only ever sets it to revoked).
const REVOKED_PATTERNS = [/status is not valid/i, /\brevoked\b/i];
// Credo sets exactly this when the wallet answers after the request expired
const EXPIRED_PATTERN = /\bsession expired\b/i;

/**
 * Maps the error message of a failed OpenID4VP verification session to a reason that is safe
 * to show. The message itself must not reach the UI: it carries Credo internals.
 */
export const toPresentationFailureReason = (
  errorMessage?: unknown,
): PresentationFailureReason => {
  if (typeof errorMessage !== 'string')
    return PresentationFailureReason.Unknown;
  if (REVOKED_PATTERNS.some((pattern) => pattern.test(errorMessage))) {
    return PresentationFailureReason.Revoked;
  }
  if (EXPIRED_PATTERN.test(errorMessage)) {
    return PresentationFailureReason.Expired;
  }
  return PresentationFailureReason.Unknown;
};
