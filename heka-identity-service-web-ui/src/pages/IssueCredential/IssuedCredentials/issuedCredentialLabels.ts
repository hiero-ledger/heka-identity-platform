import { TFunction } from 'i18next';

import { IssuedCredentialStatus } from '@/entities/IssuedCredential';
import { ProtocolType } from '@/entities/Schema';

export const protocolLabel = (protocol: ProtocolType, t: TFunction) =>
  protocol === ProtocolType.Aries
    ? t('IssueCredential.issuedCredentials.protocols.didcomm')
    : t('IssueCredential.issuedCredentials.protocols.oid4vc');

export const statusLabel = (status: IssuedCredentialStatus, t: TFunction) =>
  t(`IssueCredential.issuedCredentials.status.${status}`);
