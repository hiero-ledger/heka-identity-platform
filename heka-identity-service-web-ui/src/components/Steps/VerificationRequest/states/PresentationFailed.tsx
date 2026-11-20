import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';

import { VerificationRequestProps } from '@/components/Steps';
import { getPresentationFailureReason } from '@/entities/Presentation/model/selectors/presentationSelector';
import { PresentationFailureReason } from '@/entities/Presentation/model/types/presentation';
import IconCar from '@/shared/assets/icons/car.svg';
import FailureIcon from '@/shared/assets/icons/failure.svg';
import { Button } from '@/shared/ui/Button';
import { Column, Row } from '@/shared/ui/Grid';

import * as cls from '../VerificationRequest.module.scss';

const reasonKeys: Record<PresentationFailureReason, string> = {
  [PresentationFailureReason.Revoked]: 'Flow.messages.presentationRevoked',
  [PresentationFailureReason.Expired]: 'Flow.messages.presentationExpired',
  [PresentationFailureReason.Unknown]: 'Flow.messages.presentationFailed',
};

export const PresentationFailed = <T extends object>({
  stepDetails,
  onChangeStep,
}: VerificationRequestProps<T>) => {
  const { t } = useTranslation();
  const reason = useSelector(getPresentationFailureReason);

  return (
    <div className={cls.presentationReceivedContent}>
      <Column
        justifyContent="center"
        alignItems="center"
        className={cls.presentationReceivedWrapper}
      >
        <Row className={cls.presentationImageWrapper}>
          <IconCar
            height={230}
            width={240}
          />
          <FailureIcon
            height={126}
            width={126}
            className={cls.statusIcon}
            aria-hidden
          />
        </Row>
        <Row className={cls.title}>{t('Flow.titles.presentationFailed')}</Row>
        <Row
          className={cls.failureReason}
          role="alert"
        >
          {t(reasonKeys[reason])}
        </Row>
        <Column className={cls.buttonGroup}>
          <Button
            buttonType="filled"
            onPress={() => onChangeStep(stepDetails.next?.name)}
          >
            {stepDetails.next?.title}
          </Button>
        </Column>
      </Column>
    </div>
  );
};
