import { TFunction } from 'i18next';

import { IssuedCredential } from '@/entities/IssuedCredential';
import { ProtocolType } from '@/entities/Schema';

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
 * Revoke is offered by status only, for both protocols; the identity service decides which
 * credentials are revocable and whether the user may revoke them
 */
export const canRevoke = (item: Pick<IssuedCredential, 'revocable' | 'revoked'>) =>
  item.revocable && item.revoked !== true;

export const formatIssuedAt = (issuedAt: string): string => {
  const date = new Date(issuedAt);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

export const protocolLabel = (protocol: ProtocolType, t: TFunction) =>
  protocol === ProtocolType.Aries
    ? t('IssueCredential.issuedCredentials.protocols.didcomm')
    : t('IssueCredential.issuedCredentials.protocols.oid4vc');

export const statusLabel = (status: IssuedCredentialStatus, t: TFunction) =>
  t(`IssueCredential.issuedCredentials.status.${status}`);
