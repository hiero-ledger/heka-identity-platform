import React from 'react';

import { classNames } from '@/shared/lib/classNames';
import { Row } from '@/shared/ui/Grid';

import * as cls from './InfoRow.module.scss';

interface InfoRowProps {
  property: string;
  title: string;
  value?: string;
}

export const InfoRow = ({ property, title, value }: InfoRowProps) => {
  return (
    <Row
      key={property}
      className={cls.registration}
      alignItems="center"
    >
      <span className={cls.registrationKey}>{title}</span>
      <span
        className={classNames(cls.registrationValue, {}, ['text-subtitle-m'])}
      >
        {value}
      </span>
    </Row>
  );
};
