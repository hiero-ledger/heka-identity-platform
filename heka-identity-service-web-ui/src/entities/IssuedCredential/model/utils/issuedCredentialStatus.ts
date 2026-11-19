import { IssuedCredential } from '../types/issuedCredential';

export type IssuedCredentialStatus =
  | 'active'
  | 'revoked'
  | 'notRevocable'
  | 'unknown';

export const getIssuedCredentialStatus = (
  item: Pick<IssuedCredential, 'revocable' | 'revoked'>,
): IssuedCredentialStatus => {
  if (item.revoked === true) return 'revoked';
  if (!item.revocable) return 'notRevocable';
  return item.revoked === false ? 'active' : 'unknown';
};

/**
 * Revocable and not known to be revoked, for both protocols; the identity service decides which
 * credentials are revocable. Whether the user may revoke is a separate check
 * (`User.canRevokeCredentials`).
 */
export const canRevoke = (
  item: Pick<IssuedCredential, 'revocable' | 'revoked'>,
) => item.revocable && item.revoked !== true;
