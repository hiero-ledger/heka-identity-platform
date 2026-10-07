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
  getIsPresentationCompleted,
  getPresentationRequestId,
} from '@/entities/Presentation/model/selectors/presentationSelector';
import { updatePresentationState } from '@/entities/Presentation/model/services/updatePresentationState';
import { ProtocolType } from '@/entities/Schema/model/types/schema';
import { useRecordUpdates } from '@/shared/hooks/recordUpdates';
import { useAppDispatch } from '@/shared/lib/hooks/useAppDispatch';
import { Column, Row } from '@/shared/ui/Grid';
import { Loader } from '@/shared/ui/Loader/Loader';

import * as cls from '../VerificationRequest.module.scss';

interface PendingPresentation {
  value?: string;
  protocolType?: ProtocolType;
  useDemo?: boolean;
  // Aries only: name the new connection or send over an existing one
  connection?: ConnectionChoiceOptions;
}

export const PendingPresentation = ({
  value,
  protocolType,
  useDemo,
  connection,
}: PendingPresentation) => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const presentationRequestId = useSelector(getPresentationRequestId);
  const isPresentationCompleted = useSelector(getIsPresentationCompleted);

  const refreshPresentationState = useCallback(() => {
    if (!presentationRequestId || !protocolType) return;
    dispatch(
      updatePresentationState({
        id: presentationRequestId,
        protocolType: protocolType,
        useDemo,
      }),
    );
  }, [presentationRequestId, protocolType, dispatch, useDemo]);

  useRecordUpdates({
    recordId: protocolType ? presentationRequestId : undefined,
    isDone: isPresentationCompleted,
    refresh: refreshPresentationState,
    useDemo,
  });

  return (
    <Column className={cls.requestContent}>
      <Column
        justifyContent="flex-start"
        alignItems="flex-start"
        className={cls.header}
      >
        <Row className={cls.title}>{t('Flow.titles.verificationRequest')}</Row>
        {!connection?.isExistingConnectionSelected && (
          <Row className={cls.description}>
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
            waitingText={t('Connection.titles.waitingRequest')}
          />
        ) : (
          <>
            {!value && <Loader />}
            {value && <QRCode content={value} />}
          </>
        )}
      </Column>
    </Column>
  );
};
