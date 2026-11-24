import { TFunction } from 'i18next';
import { useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';

import {
  canRevoke,
  getIssuedCredentialStatus,
  IssuedCredential,
  revokeIssuedCredential,
} from '@/entities/IssuedCredential';
import {
  getIsIssuedCredentialRevoking,
  getIssuedCredentialByKey,
} from '@/entities/IssuedCredential/model/selectors/issuedCredentialsSelector';
import { ProtocolType } from '@/entities/Schema';
import { getUserCanRevokeCredentials } from '@/entities/User/model/selectors/userSelector';
import { formatDateTime } from '@/shared/lib/date';
import { useAppDispatch } from '@/shared/lib/hooks/useAppDispatch';
import { Button } from '@/shared/ui/Button';
import useConfirmDialog, { ConfirmForm } from '@/shared/ui/ConfirmDialog';
import { Modal } from '@/shared/ui/Modal/Modal';

import { protocolLabel, statusLabel } from '../issuedCredentialLabels';

import * as cls from './IssuedCredentialDetails.module.scss';

interface IssuedCredentialDetailsProps {
  /** Store key of the credential to show; the modal is closed while undefined */
  itemKey?: string;
  onOpenChange: (open: boolean) => void;
}

/** Label and value of each detail row; protocol-specific rows only when the credential has them */
const issuedCredentialDetailRows = (
  item: IssuedCredential,
  t: TFunction,
): Array<[label: string, value: string]> => {
  const rows: Array<[string, string]> = [];
  // Without a resolved schema the title already shows the raw ids: no row repeats them
  if (item.schemaName) {
    rows.push([
      t('IssueCredential.issuedCredentials.details.schema'),
      item.schemaName,
    ]);
  }
  rows.push(
    [
      t('IssueCredential.issuedCredentials.details.protocol'),
      protocolLabel(item.protocol, t),
    ],
    [
      t('IssueCredential.issuedCredentials.details.format'),
      item.formats.join(', '),
    ],
    [
      t('IssueCredential.issuedCredentials.details.issued'),
      formatDateTime(item.issuedAt),
    ],
    [
      t('IssueCredential.issuedCredentials.details.status'),
      statusLabel(getIssuedCredentialStatus(item), t),
    ],
  );
  if (item.protocol === ProtocolType.Oid4vc && item.issuerDid) {
    rows.push([
      t('IssueCredential.issuedCredentials.details.issuerDid'),
      item.issuerDid,
    ]);
  }
  if (item.protocol === ProtocolType.Aries && item.credentialDefinitionId) {
    rows.push([
      t('IssueCredential.issuedCredentials.details.credentialDefinitionId'),
      item.credentialDefinitionId,
    ]);
  }
  if (item.protocol === ProtocolType.Oid4vc && item.credentialConfigurationIds) {
    rows.push([
      t('IssueCredential.issuedCredentials.details.credentialConfigurations'),
      item.credentialConfigurationIds.join(', '),
    ]);
  }
  rows.push([t('IssueCredential.issuedCredentials.details.recordId'), item.id]);
  return rows;
};

/**
 * Metadata of an issued credential, never its claims, with Revoke for revocable credentials
 * (AnonCreds over DIDComm, SD-JWT VC over OpenID4VC)
 */
export const IssuedCredentialDetails = ({
  itemKey,
  onOpenChange,
}: IssuedCredentialDetailsProps) => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  // Read from the store, so the status follows a revocation while the modal is open
  const selectItem = useMemo(() => getIssuedCredentialByKey(itemKey), [itemKey]);
  const item = useSelector(selectItem);
  const selectIsRevoking = useMemo(
    () => getIsIssuedCredentialRevoking(itemKey),
    [itemKey],
  );
  const isRevoking = useSelector(selectIsRevoking);
  // Unknown (not loaded yet) still offers Revoke: the identity service enforces the roles
  const canRevokeCredentials = useSelector(getUserCanRevokeCredentials) !== false;

  const revoke = useCallback(async () => {
    if (!item) return;
    try {
      const { alreadyRevoked } = await dispatch(
        revokeIssuedCredential({
          id: item.id,
          key: item.key,
          protocol: item.protocol,
        }),
      ).unwrap();
      toast.success(
        alreadyRevoked
          ? t('IssueCredential.issuedCredentials.messages.alreadyRevoked')
          : t('IssueCredential.issuedCredentials.messages.revoked'),
      );
    } catch {
      // The thunk has already shown the server's message
    }
  }, [dispatch, item, t]);

  const { dialogProps, confirm } = useConfirmDialog({
    text: t('IssueCredential.issuedCredentials.confirmation.text'),
    details: t('IssueCredential.issuedCredentials.confirmation.details'),
    acceptButtonText: t('IssueCredential.issuedCredentials.confirmation.accept'),
    cancelButtonText: t('IssueCredential.issuedCredentials.confirmation.cancel'),
    onAccept: revoke,
  });

  if (!item) return <ConfirmForm {...dialogProps} />;

  const rows = issuedCredentialDetailRows(item, t);

  return (
    <>
      <Modal
        title={item.name}
        isOpen
        handleToggle={onOpenChange}
      >
        <dl className={cls.fields}>
          {rows.map(([label, value]) => (
            <div
              key={label}
              className={cls.field}
            >
              <dt className={cls.label}>{label}</dt>
              <dd className={cls.value}>{value}</dd>
            </div>
          ))}
        </dl>
        {canRevokeCredentials && canRevoke(item) && (
          <Button
            className={cls.revokeButton}
            fullWidth
            isDisabled={isRevoking}
            onPress={confirm}
          >
            {t('IssueCredential.issuedCredentials.buttons.revoke')}
          </Button>
        )}
      </Modal>
      <ConfirmForm {...dialogProps} />
    </>
  );
};
