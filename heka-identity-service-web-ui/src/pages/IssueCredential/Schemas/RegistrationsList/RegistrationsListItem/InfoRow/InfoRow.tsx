import React from 'react';

import { Column, Row } from '@/shared/ui/Grid';

import * as cls from './InfoRow.module.scss';

interface InfoRowProps {
  title: string;
  value?: string;
}

export const InfoRow = ({ title, value }: InfoRowProps) => {
  return (
    <Row
      key={title}
      className={cls.property}
    >
      <Column className={cls.name}>{title}</Column>
      <Column className={cls.value}>{value}</Column>
    </Row>
  );
};
