import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/ui/Button';
import { Column } from '@/shared/ui/Grid';

import * as cls from './LoadErrorAlert.module.scss';

interface LoadErrorAlertProps {
  children: ReactNode;
  onRetry: () => void;
}

/** An inline load error (or a partial-load warning) with a Retry button. */
export const LoadErrorAlert = ({ children, onRetry }: LoadErrorAlertProps) => {
  const { t } = useTranslation();

  return (
    <Column
      className={cls.LoadErrorAlert}
      role="alert"
    >
      {children}
      <Button onPress={onRetry}>{t('Dids.list.retry')}</Button>
    </Column>
  );
};
