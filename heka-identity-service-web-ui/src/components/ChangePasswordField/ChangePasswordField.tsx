import { joiResolver } from '@hookform/resolvers/joi';
import React, { useCallback, useEffect } from 'react';
import { Label } from 'react-aria-components';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import {
  ChangePasswordFieldFormData,
  ChangePasswordFieldFormSchema,
  defaultChangePasswordFieldFormValues,
} from '@/components/ChangePasswordField/ChangePasswordField.form';
import { Delimiter } from '@/components/Delimiter';
import { EditField } from '@/components/EditField/EditField';
import { EditForm } from '@/components/EditForm';
import { Modal } from '@/shared/ui/Modal/Modal';
import { TextInput } from '@/shared/ui/TextInput';

interface ChangePasswordFieldModalProps {
  isModalOpen: boolean;
  setIsModalOpen: (isOpen: boolean) => void;
  onSubmit: (v: ChangePasswordFieldFormData) => void;
  className?: string;
  alignOnStart?: boolean;
}

const PasswordFill = '*'.repeat(8);

export const ChangePasswordField = ({
  isModalOpen,
  setIsModalOpen,
  onSubmit,
  className,
  alignOnStart,
}: ChangePasswordFieldModalProps) => {
  const { t } = useTranslation();

  const {
    handleSubmit,
    control,
    reset,
    clearErrors,
    watch,
    //formState: {},
  } = useForm<ChangePasswordFieldFormData>({
    defaultValues: defaultChangePasswordFieldFormValues,
    resolver: joiResolver(ChangePasswordFieldFormSchema),
    mode: 'onSubmit',
    reValidateMode: 'onSubmit',
  });

  const resetForm = useCallback(() => {
    reset();
  }, [reset]);

  const onSubmitHandle = useCallback(
    (v: ChangePasswordFieldFormData) => {
      onSubmit(v);
      reset();
    },
    [onSubmit, reset],
  );

  const newPasswordWatch = watch('password');

  useEffect(() => {
    clearErrors('passwordRepeat');
  }, [newPasswordWatch, clearErrors]);

  return (
    <>
      <EditField
        labelKey="ChangePassword.titles.modal"
        className={className}
        alignOnStart={alignOnStart}
        onPress={() => {
          reset();
          setIsModalOpen(true);
        }}
      >
        <Label className="text-subtitle-m">{PasswordFill}</Label>
      </EditField>
      <Modal
        title={t('ChangePassword.titles.modal')}
        isOpen={isModalOpen}
        handleToggle={(isOpen) => {
          if (!isOpen) resetForm();
          setIsModalOpen(isOpen);
        }}
      >
        <EditForm
          onSubmit={handleSubmit(onSubmitHandle)}
          submitLabel="ChangePassword.buttons.save"
        >
          <TextInput
            label={t('ChangePassword.titles.currentPassword')}
            name="oldPassword"
            control={control}
            clearErrors={clearErrors}
            hideText
          />
          <Delimiter />
          <TextInput
            label={t('ChangePassword.titles.password')}
            name="password"
            control={control}
            clearErrors={clearErrors}
            hideText
          />
          <TextInput
            label={t('ChangePassword.titles.confirmPassword')}
            name="passwordRepeat"
            control={control}
            clearErrors={clearErrors}
            hideText
          />
        </EditForm>
      </Modal>
    </>
  );
};
