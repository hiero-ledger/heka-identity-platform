import React, { FormEventHandler } from 'react';
import { useTranslation } from 'react-i18next';

import { classNames } from '@/shared/lib/classNames';
import { Button } from '@/shared/ui/Button';

import * as cls from './EditForm.module.scss';

interface EditFormProps {
  className?: string;
  onSubmit: FormEventHandler;
  isSubmitDisabled?: boolean;
  submitLabel: string;
  children?: React.ReactNode;
}

export const EditForm = ({
  className,
  onSubmit,
  isSubmitDisabled = false,
  submitLabel,
  children,
}: EditFormProps) => {
  const { t } = useTranslation();

  return (
    <form
      className={classNames(cls.EditForm, {}, [className])}
      onSubmit={onSubmit}
    >
      {children}
      <Button
        className={cls.submitBtn}
        type="submit"
        isDisabled={isSubmitDisabled}
      >
        {t(submitLabel)}
      </Button>
    </form>
  );
};
