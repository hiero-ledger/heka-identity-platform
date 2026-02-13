import React from 'react';

import LinearSpinner from '@/shared/assets/icons/linear-spinner.svg';
import Spinner from '@/shared/assets/icons/spinner.svg';
import { Row } from '@/shared/ui/Grid';

import { LoaderProps, LoaderType } from './types';

export const Loader = ({ size, type = LoaderType.Circular }: LoaderProps) => {
  switch (type) {
    case LoaderType.Circular:
      return (
        <Spinner
          style={{ zIndex: 1000 }}
          height={size ?? 260}
          width={size ?? 260}
        />
      );
    case LoaderType.Linear:
      return (
        <LinearSpinner
          style={{ zIndex: 1000 }}
          height={size ?? 240}
          width={size ?? 240}
        />
      );
    default:
      return null;
  }
};

export const LoaderView = () => {
  return (
    <Row style={{ flex: 1, justifyContent: 'center' }}>
      <Loader />
    </Row>
  );
};
