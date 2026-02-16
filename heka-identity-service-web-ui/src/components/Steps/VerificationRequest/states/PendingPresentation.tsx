import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';

import { CopyLink } from '@/components/Link/CopyLink';
import { QRCode } from '@/components/QRCode';
import { pollTimeout } from '@/const/behaviour';
import {
  getIsPresentationCompleted,
  getPresentationRequestId,
} from '@/entities/Presentation/model/selectors/presentationSelector';
import { updatePresentationState } from '@/entities/Presentation/model/services/updatePresentationState';
import { ProtocolType } from '@/entities/Schema/model/types/schema';
import { useAppDispatch } from '@/shared/lib/hooks/useAppDispatch';
import { Column, Row } from '@/shared/ui/Grid';
import { Loader } from '@/shared/ui/Loader/Loader';

import * as cls from '../VerificationRequest.module.scss';

interface PendingPresentation {
  value?: string;
  protocolType?: ProtocolType;
  useDemo?: boolean;
}

export const PendingPresentation = ({
  value,
  protocolType,
  useDemo,
}: PendingPresentation) => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const presentationRequestId = useSelector(getPresentationRequestId);
  const isPresentationCompleted = useSelector(getIsPresentationCompleted);

  useEffect(() => {
    if (presentationRequestId && protocolType && !isPresentationCompleted) {
      const polling = setInterval(() => {
        dispatch(
          updatePresentationState({
            id: presentationRequestId,
            protocolType: protocolType,
            useDemo,
          }),
        );
      }, pollTimeout);
      return () => clearInterval(polling);
    }
  }, [
    presentationRequestId,
    isPresentationCompleted,
    protocolType,
    dispatch,
    useDemo,
  ]);

  return (
    <Column className={cls.requestContent}>
      <Column
        justifyContent="flex-start"
        alignItems="flex-start"
        className={cls.header}
      >
        <Row
          className={cls.title}
        >
          {t('Flow.titles.verificationRequest')}
        </Row>
        <Row
          className={cls.description}
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
    </Column>
  );
};
