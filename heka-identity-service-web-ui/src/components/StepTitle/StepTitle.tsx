import React from 'react';

import { Column } from '@/shared/ui/Grid';

import * as cls from './StepTitle.module.scss';

type StepTitleProps = {
  title: string;
};

export const StepTitle = ({ title }: StepTitleProps) => {
  return <p className={cls.stepTitle}>{title}</p>;
};

type StepHeaderProps = {
  title: string;
  details?: string[];
};

export const StepHeader = ({ title, details }: StepHeaderProps) => {
  return (
    <Column className={cls.stepHeader}>
      <StepTitle title={title} />
      {details && (
        <div>
          {details.map((d) => (
            <p
              key={d}
              className={cls.stepDetails}
            >
              {d}
            </p>
          ))}
        </div>
      )}
    </Column>
  );
};
