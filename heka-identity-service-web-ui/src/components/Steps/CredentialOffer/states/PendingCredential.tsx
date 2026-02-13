import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';

import { CopyLink } from '@/components/Link/CopyLink';
import { QRCode } from '@/components/QRCode';
import { pollTimeout } from '@/const/behaviour';
import {
  getCredentialOfferId,
  getIsCredentialSent,
} from '@/entities/Credential/model/selectors/credentialSelector';
import { updateCredentialState } from '@/entities/Credential/model/services/updateCredentialState';
import { ProtocolType } from '@/entities/Schema/model/types/schema';
import { useAppDispatch } from '@/shared/lib/hooks/useAppDispatch';
import { Column, Row } from '@/shared/ui/Grid';
import { Loader } from '@/shared/ui/Loader/Loader';

import * as cls from '../CredentialOffer.module.scss';

interface PendingCredentialParams {
  value?: string;
  protocolType?: ProtocolType;
  useDemo?: boolean;
}

export const PendingCredential = ({
  value,
  protocolType,
  useDemo,
}: PendingCredentialParams) => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const credentialOfferId = useSelector(getCredentialOfferId);
  const isCredentialSent = useSelector(getIsCredentialSent);

  useEffect(() => {
    if (credentialOfferId && protocolType && !isCredentialSent) {
      const polling = setInterval(() => {
        dispatch(
          updateCredentialState({
            protocolType: protocolType,
            id: credentialOfferId,
            useDemo,
          }),
        );
      }, pollTimeout);
      return () => clearInterval(polling);
    }
  }, [credentialOfferId, isCredentialSent, protocolType, dispatch, useDemo]);

  return (
    <>
      <Column
        justifyContent="flex-start"
        alignItems="flex-start"
        className={cls.header}
      >
        <Row className={cls.title}>{t('Flow.titles.credentialOffer')}</Row>
        <Row
          className={cls.description}
          alignItems="center"
        >
          <p>
            {t('Common.titles.scanQR')}&nbsp;
            <CopyLink value={value} />
          </p>
        </Row>
      </Column>
      <Column
        className={cls.mainContent}
        justifyContent="center"
        alignItems="center"
      >
        {!value && <Loader />}
        {value && <QRCode content={value} />}
      </Column>
    </>
  );
};
