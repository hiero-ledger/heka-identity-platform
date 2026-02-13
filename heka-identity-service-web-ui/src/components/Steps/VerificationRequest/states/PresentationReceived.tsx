import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';

import { SaveVerificationTemplateModal } from '@/components/SaveVerificationTemplateModal';
import { VerificationRequestProps } from '@/components/Steps';
import { getPresentationSharedAttributes } from '@/entities/Presentation/model/selectors/presentationSelector';
import IconCar from '@/shared/assets/icons/car.svg';
import SuccessIcon from '@/shared/assets/icons/success.svg';
import { Button } from '@/shared/ui/Button';
import { Column, Row } from '@/shared/ui/Grid';

import * as cls from '../VerificationRequest.module.scss';

export const PresentationReceived = <T extends object>({
  context,
  stepDetails,
  onChangeStep,
}: VerificationRequestProps<T>) => {
  const { t } = useTranslation();
  const [isTemplateModalOpen, setTemplateModalOpen] = useState(false);
  const revealedAttributes = useSelector(getPresentationSharedAttributes);

  const sortedRevealedAttributes = useMemo(() => {
    if (!revealedAttributes) return [];
    const fieldNames = context?.schema?.fields.map((f) => f.name) ?? [];
    return [...revealedAttributes].sort(
      (a, b) => fieldNames.indexOf(a.name) - fieldNames.indexOf(b.name),
    );
  }, [context, revealedAttributes]);

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
          <SuccessIcon
            height={126}
            width={126}
            className={cls.successIcon}
          />
        </Row>
        <Row className={cls.title}>{t('Flow.titles.presentationReceived')}</Row>
        <Column className={cls.buttonGroup}>
          <Button
            buttonType="outlined"
            onPress={() => onChangeStep(stepDetails.next?.name)}
          >
            {stepDetails.next?.title}
          </Button>
          {!context.useDemo && (
            <Button
              buttonType="text"
              onPress={() => setTemplateModalOpen(true)}
            >
              {t('Common.buttons.saveAsTemplate')}
            </Button>
          )}
        </Column>
      </Column>
      <Column
        justifyContent="flex-start"
        alignItems="center"
        className={cls.presentationDetailsWrapper}
      >
        {sortedRevealedAttributes.map((revealedAttribute) => (
          <Row
            className={cls.detailsRowWrapper}
            key={revealedAttribute.name}
          >
            <Column className={cls.attributeName}>
              {revealedAttribute.name}
            </Column>
            <Column className={cls.attributeValue}>
              {revealedAttribute.value}
            </Column>
          </Row>
        ))}
      </Column>
      <SaveVerificationTemplateModal
        context={context}
        isOpen={isTemplateModalOpen}
        onOpenChange={setTemplateModalOpen}
      />
    </div>
  );
};
