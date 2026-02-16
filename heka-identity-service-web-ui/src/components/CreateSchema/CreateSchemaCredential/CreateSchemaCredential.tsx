import { useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import {
  CreateSchemaCredentialFormData,
  CreateSchemaCredentialFormDefaults as CreateSchemaCredentialFormDefaultValues,
} from '@/components/CreateSchema/CreateSchemaCredential/CreateSchemaCredential.form';
import { Column } from '@/shared/ui/Grid';
import { TextInput } from '@/shared/ui/TextInput';

import * as cls from './CreateSchemaCredential.module.scss';

interface CreateSchemaCredentialProps {
  onCreate: (name: string) => void;
}

export default function CreateSchemaCredential({
  onCreate,
}: CreateSchemaCredentialProps) {
  const { t } = useTranslation();

  const { control, register, reset } = useForm<CreateSchemaCredentialFormData>({
    defaultValues: CreateSchemaCredentialFormDefaultValues,
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  });

  const resetForm = useCallback(() => {
    reset(CreateSchemaCredentialFormDefaultValues);
  }, [reset]);

  const onChangeValue = (value: string) => {
    if (onCreate) onCreate(value);
    resetForm();
  };

  return (
    <Column>
      <form>
        <div className={cls.inputWrapper}>
          <TextInput
            label={t('CreateSchema.titles.newCredentialField')}
            {...register('name')}
            control={control}
            onChangeValue={onChangeValue}
          />
        </div>
      </form>
    </Column>
  );
}
