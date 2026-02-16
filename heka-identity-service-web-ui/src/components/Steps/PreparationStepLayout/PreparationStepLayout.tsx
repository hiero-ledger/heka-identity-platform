import React from 'react';
import { useTranslation } from 'react-i18next';

import { NextStepName } from '@/components/Steps/Step.types';
import { Column, Row } from '@/shared/ui/Grid';
import { Stepper } from '@/shared/ui/Stepper/Stepper';

import * as cls from './PreparationStepLayout.module.scss';

export interface PreparationStepWrapperProps<T> {
  children: React.ReactNode;
  totalPreparationSteps: number;
  stepNumber: number;
  onChangeStep: (step?: NextStepName<T>) => void;
  context: T;
}

export const PreparationStepLayout = <T extends object>({
  children,
  stepNumber,
  totalPreparationSteps,
}: PreparationStepWrapperProps<T>) => {
  const { t } = useTranslation();
  return (
    <Row
      className={cls.PreparationStepLayout}
      justifyContent="center"
      alignItems="center"
    >
      <Column
        alignItems="center"
        className={cls.contentWrapper}
      >
        <Column
          justifyContent="flex-start"
          className={cls.stepWrapper}
        >
          <Stepper
            totalSteps={totalPreparationSteps}
            activeStep={stepNumber}
          />
          <p className={cls.stepNumberTitle}>
            {t('Flow.titles.step', {
              stepNumber: stepNumber,
              totalPreparationSteps: totalPreparationSteps,
            })}
          </p>
        </Column>

        <Column
          className={cls.stepContentWrapper}
          justifyContent="center"
          alignItems="center"
        >
          {children}
        </Column>
      </Column>
    </Row>
  );
};
