import React from 'react';

import { classNames } from '@/shared/lib/classNames';
import { Column, Row } from '@/shared/ui/Grid';

import * as cls from './Stepper.module.scss';

export interface StepperProps {
  totalSteps: number;
  activeStep: number;
}

export const Stepper = ({ totalSteps, activeStep }: StepperProps) => {
  return (
    <Row
      alignItems="center"
      justifyContent="flex-start"
      className={cls.Stepper}
    >
      {Array.from(Array(totalSteps).keys()).map((step) => (
        <Row
          alignItems="center"
          key={step.toString()}
        >
          <Column
            justifyContent="center"
            alignItems="center"
            className={classNames(cls.step, {
              [cls.active]: step <= activeStep - 1,
            })}
          >
            <Column className={cls.stepInner} />
          </Column>
          {step !== totalSteps - 1 && (
            <Column
              className={classNames(cls.connector, {
                [cls.active]: step < activeStep - 1,
              })}
            />
          )}
        </Row>
      ))}
    </Row>
  );
};
