import { useCallback, useEffect, useState } from 'react';
import { Label } from 'react-aria-components';
import { RegisterOptions, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { EditField } from '@/components/EditField/EditField';
import { EditForm } from '@/components/EditForm';
import { Modal } from '@/shared/ui/Modal/Modal';
import { TextInput } from '@/shared/ui/TextInput';

import * as cls from './TextField.module.scss';

export interface TextFieldFormData {
  field: string;
  value?: string;
}

interface TextFieldModalProps {
  labelKey: string;
  field: string;
  value: string;
  onSubmit: (v: TextFieldFormData) => void;
  className?: string;
  alignOnStart?: boolean;
  isLoading?: boolean;
  isEditDisabled?: boolean;
  fieldValidator?: RegisterOptions<TextFieldFormData, 'value'>;
}

export const TextField = ({
  labelKey,
  field,
  value,
  onSubmit,
  className,
  alignOnStart,
  isLoading,
  isEditDisabled,
  fieldValidator,
}: TextFieldModalProps) => {
  const { t } = useTranslation();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [defaultValue, setDefaultValue] = useState({ field, value });

  const {
    handleSubmit,
    control,
    register,
    reset,
    formState: { isDirty, isValid },
  } = useForm<TextFieldFormData>({
    defaultValues: defaultValue,
    mode: 'onChange',
  });

  const resetForm = useCallback(() => {
    reset(defaultValue);
  }, [defaultValue, reset]);

  const onSubmitHandle = (v: TextFieldFormData) => {
    onSubmit(v);
    resetForm();
    setIsModalOpen(false);
  };

  useEffect(() => {
    setDefaultValue({ field, value });
  }, [field, value]);

  return (
    <>
      <EditField
        labelKey={labelKey}
        className={className}
        alignOnStart={alignOnStart}
        isLoading={isLoading}
        isEditDisabled={isEditDisabled}
        onPress={() => {
          resetForm();
          setIsModalOpen(true);
        }}
      >
        <Label
          title={value}
          className={cls.textFieldLabel}
        >
          {value}
        </Label>
      </EditField>
      <Modal
        title={t(labelKey)}
        isOpen={isModalOpen}
        handleToggle={(isOpen) => {
          if (!isOpen) resetForm();
          setIsModalOpen(isOpen);
        }}
      >
        <EditForm
          onSubmit={handleSubmit(onSubmitHandle)}
          isSubmitDisabled={!isDirty || !isValid}
          submitLabel="Profile.buttons.submit"
        >
          <TextInput
            label={t(labelKey)}
            {...register('value', fieldValidator)}
            control={control}
          />
        </EditForm>
      </Modal>
    </>
  );
};
