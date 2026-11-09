import { ReactNode, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';

import { revokeIssuedCredential } from '@/entities/IssuedCredential';
import {
  getIsIssuedCredentialRevoking,
  getIssuedCredentialByKey,
} from '@/entities/IssuedCredential/model/selectors/issuedCredentialsSelector';
import { ProtocolType } from '@/entities/Schema';
import { useAppDispatch } from '@/shared/lib/hooks/useAppDispatch';
import { Button } from '@/shared/ui/Button';
import useConfirmDialog, { ConfirmForm } from '@/shared/ui/ConfirmDialog';
import { Modal } from '@/shared/ui/Modal/Modal';

import {
  canRevoke,
  formatIssuedAt,
  getIssuedCredentialStatus,
  protocolLabel,
  statusLabel,
} from '../issuedCredentialView';

import * as cls from './IssuedCredentialDetails.module.scss';

interface IssuedCredentialDetailsProps {
  /** Store key of the credential to show; the modal is closed while undefined */
  itemKey?: string;
  onOpenChange: (open: boolean) => void;
}

/** Metadata of an issued credential, never its claims, with Revoke for revocable AnonCreds credentials */
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

  const revoke = useCallback(async () => {
    if (!item) return;
    try {
      const { alreadyRevoked } = await dispatch(
        revokeIssuedCredential({ id: item.id, key: item.key }),
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

  const status = getIssuedCredentialStatus(item);
  const fields: Array<[string, ReactNode]> = [
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
      formatIssuedAt(item.issuedAt),
    ],
    [
      t('IssueCredential.issuedCredentials.details.status'),
      statusLabel(status, t),
    ],
  ];
  if (item.protocol === ProtocolType.Oid4vc && item.issuerDid) {
    fields.push([
      t('IssueCredential.issuedCredentials.details.issuerDid'),
      item.issuerDid,
    ]);
  }
  if (item.protocol === ProtocolType.Aries && item.credentialDefinitionId) {
    fields.push([
      t('IssueCredential.issuedCredentials.details.credentialDefinitionId'),
      item.credentialDefinitionId,
    ]);
  }
  if (item.protocol === ProtocolType.Oid4vc && item.credentialConfigurationIds) {
    fields.push([
      t('IssueCredential.issuedCredentials.details.credentialConfigurations'),
      item.credentialConfigurationIds.join(', '),
    ]);
  }
  fields.push([t('IssueCredential.issuedCredentials.details.recordId'), item.id]);

  return (
    <>
      <Modal
        title={item.name}
        isOpen
        handleToggle={onOpenChange}
      >
        <dl className={cls.fields}>
          {fields.map(([label, value]) => (
            <div
              key={label}
              className={cls.field}
            >
              <dt className={cls.label}>{label}</dt>
              <dd className={cls.value}>{value}</dd>
            </div>
          ))}
        </dl>
        {canRevoke(item) && (
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
