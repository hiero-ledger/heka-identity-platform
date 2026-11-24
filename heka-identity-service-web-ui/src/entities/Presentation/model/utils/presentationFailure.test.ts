import { toPresentationFailureReason } from './presentationFailure';
import { PresentationFailureReason } from '../types/presentation';

// What Credo 0.7 stores on the verification session when an SD-JWT VC is revoked: the
// Oauth2ServerErrorResponseError message (internal message plus the JSON error response)
const revokedSdJwtMessage = [
  '\t- [0]: Error occured during verification of presentation. Status is not valid - SDJWTException: Status is not valid',
  JSON.stringify(
    {
      error: 'invalid_request',
      error_description: 'One or more presentations failed verification.',
    },
    null,
    2,
  ),
].join('\n');

describe('toPresentationFailureReason', () => {
  test.each([
    ['a revoked SD-JWT VC (status list)', revokedSdJwtMessage],
    ['a message that names revocation', 'Credential has been revoked'],
  ])('maps %s to revoked', (_, message) => {
    expect(toPresentationFailureReason(message)).toBe(
      PresentationFailureReason.Revoked,
    );
  });

  test('maps an expired session to expired', () => {
    expect(toPresentationFailureReason('session expired')).toBe(
      PresentationFailureReason.Expired,
    );
  });

  test.each([
    ['another verification error', 'Invalid presentation submission.'],
    ['a revocable-but-not-revoked mention', 'Credential must be revocable'],
    ['no message', undefined],
    ['a non-string message', { message: 'revoked' }],
  ])('maps %s to unknown', (_, message) => {
    expect(toPresentationFailureReason(message)).toBe(
      PresentationFailureReason.Unknown,
    );
  });
});
