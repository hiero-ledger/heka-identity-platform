import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';

import {
  ConnectionChoice,
  ConnectionChoiceOptions,
} from '@/components/ExistingConnection';
import { CopyLink } from '@/components/Link/CopyLink';
import { QRCode } from '@/components/QRCode';
import {
  getCredentialOfferId,
  getIsCredentialSent,
} from '@/entities/Credential/model/selectors/credentialSelector';
import { updateCredentialState } from '@/entities/Credential/model/services/updateCredentialState';
import { ProtocolType } from '@/entities/Schema/model/types/schema';
import { useRecordUpdates } from '@/shared/hooks/recordUpdates';
import { useAppDispatch } from '@/shared/lib/hooks/useAppDispatch';
import { Column, Row } from '@/shared/ui/Grid';
import { Loader } from '@/shared/ui/Loader/Loader';

import * as cls from '../CredentialOffer.module.scss';

interface PendingCredentialParams {
  value?: string;
  protocolType?: ProtocolType;
  useDemo?: boolean;
  // Aries only: name the new connection or send over an existing one
  connection?: ConnectionChoiceOptions;
}

export const PendingCredential = ({
  value,
  protocolType,
  useDemo,
  connection,
}: PendingCredentialParams) => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const credentialOfferId = useSelector(getCredentialOfferId);
  const isCredentialSent = useSelector(getIsCredentialSent);

  const refreshCredentialState = useCallback(() => {
    if (!credentialOfferId || !protocolType) return;
    dispatch(
      updateCredentialState({
        protocolType: protocolType,
        id: credentialOfferId,
        useDemo,
      }),
    );
  }, [credentialOfferId, protocolType, dispatch, useDemo]);

  useRecordUpdates({
    recordId: protocolType ? credentialOfferId : undefined,
    isDone: isCredentialSent,
    refresh: refreshCredentialState,
    useDemo,
  });

  return (
    <>
      <Column
        justifyContent="flex-start"
        alignItems="flex-start"
        className={cls.header}
      >
        <Row className={cls.title}>{t('Flow.titles.credentialOffer')}</Row>
        {!connection?.isExistingConnectionSelected && (
          <Row
            className={cls.description}
            alignItems="center"
          >
            <p>
              {t('Common.titles.scanQR')}&nbsp;
              <CopyLink value={value} />
            </p>
          </Row>
        )}
      </Column>
      <Column
        className={cls.mainContent}
        justifyContent="center"
        alignItems="center"
      >
        {connection ? (
          <ConnectionChoice
            {...connection}
            qrValue={value}
            waitingText={t('Connection.titles.waitingOffer')}
          />
        ) : (
          <>
            {!value && <Loader />}
            {value && <QRCode content={value} />}
          </>
        )}
      </Column>
    </>
  );
};
