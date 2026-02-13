import { joiResolver } from '@hookform/resolvers/joi';
import React, { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';

import { BackgroundColorField } from '@/components/BackgroundColorField';
import CreateSchemaCredential from '@/components/CreateSchema/CreateSchemaCredential/CreateSchemaCredential';
import CredentialFields from '@/components/CreateSchema/CredentialFields/CredentialFields';
import { Delimiter } from '@/components/Delimiter';
import { LogoImageField } from '@/components/LogoImageField';
import { defaultSchemaBackgroundColor } from '@/const/color';
import { defaultLogoImagePath } from '@/const/image';
import { Schema } from '@/entities/Schema';
import { selectSchemaLoading } from '@/entities/Schema/model/selectors/schemasSelector';
import { createNewSchema } from '@/entities/Schema/model/services/createSchema';
import { getSchemaList } from '@/entities/Schema/model/services/getSchemaList';
import { useAppDispatch } from '@/shared/lib/hooks/useAppDispatch';
import { Button } from '@/shared/ui/Button';
import { Column, Row } from '@/shared/ui/Grid';
import { Modal } from '@/shared/ui/Modal/Modal';
import { TextInput } from '@/shared/ui/TextInput/TextInput';

import {
  CreateSchemaFormData,
  CreateSchemaFormDefaultValues,
  CreateSchemaFormSchema,
  Credential,
} from './CreateSchema.form';

import * as cls from './CreateSchema.module.scss';

interface CreateSchemaModalProps {
  isOpen: boolean;
  onOpenChange: (value: boolean) => void;
  onSchemaCreated?: (schema: Schema) => void;
}

export const CreateSchemaModal = ({
  isOpen,
  onOpenChange,
  onSchemaCreated,
}: CreateSchemaModalProps) => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const DEFAULT_IMAGE_NAME = 'default_image.jpg';

  const isLoading = useSelector(selectSchemaLoading);

  const [logo, setLogo] = useState<File | string>(defaultLogoImagePath);
  const [color, setColor] = useState<string>(defaultSchemaBackgroundColor);

  const [credentialErrors, setErrorMessage] = useState<string | undefined>(
    undefined,
  );
  const [isNewField, setIsNewField] = useState<boolean>(false);

  const formName = 'schema-form';

  const {
    handleSubmit,
    control,
    register,
    watch,
    reset,
    setValue,
    setFocus,
    formState: { isValid },
    trigger,
  } = useForm<CreateSchemaFormData>({
    defaultValues: CreateSchemaFormDefaultValues,
    resolver: joiResolver(CreateSchemaFormSchema),
    mode: 'onChange',
    criteriaMode: 'all',
  });

  const resetForm = useCallback(() => {
    setLogo(defaultLogoImagePath);
    setColor(defaultSchemaBackgroundColor);
    reset(CreateSchemaFormDefaultValues);
  }, [reset]);

  useEffect(() => {
    resetForm();
  }, [resetForm]);

  const { credentials } = watch();

  useEffect(() => {
    const loadDefaultImage = async () => {
      try {
        const response = await fetch(defaultLogoImagePath);
        const blob = await response.blob();
        const defaultFile = new File([blob], DEFAULT_IMAGE_NAME, {
          type: blob.type,
        });
        setLogo(defaultFile);
      } catch (error) {
        console.error('Failed to load default image', error);
      }
    };

    loadDefaultImage().then();
  }, []);

  const isFieldsUnique = useCallback((data: Credential[]) => {
    if (!data) return true;

    const names = data.map((item) => item.name);
    const uniqueNames = new Set(names);
    return uniqueNames.size === names.length;
  }, []);

  const createSchema = useCallback(
    async (data: CreateSchemaFormData) => {
      const isUnique = isFieldsUnique(data.credentials);
      if (!isUnique) {
        setErrorMessage(t('CreateSchema.texts.credentialFieldsShouldBeUnique'));
        return;
      }

      setErrorMessage(undefined);

      const formData = new FormData();
      formData.append('name', data.name);
      if (logo) formData.append('logo', logo);
      if (color) formData.append('bgColor', color);
      data.credentials.forEach((credential) => {
        formData.append('fields[]', credential.name);
      });

      try {
        const newSchema = await dispatch(createNewSchema(formData)).unwrap();
        toast.success(t('CreateSchema.messages.success'));
        resetForm();
        onOpenChange(false);
        if (onSchemaCreated) {
          onSchemaCreated(newSchema);
        }
      } catch (e) {
        setErrorMessage(e);
        dispatch(getSchemaList({ isHidden: false }));
      }
    },
    [
      dispatch,
      resetForm,
      t,
      color,
      isFieldsUnique,
      logo,
      onOpenChange,
      onSchemaCreated,
      setErrorMessage,
    ],
  );

  const handleOnCredentialFieldCreate = useCallback(
    async (name: string) => {
      const fields = [...credentials, { name } as Credential];
      setValue('credentials', fields);
      setErrorMessage(undefined);
      setIsNewField(true);
      await trigger();
    },
    [setValue, credentials, trigger],
  );

  useEffect(() => {
    setFocus(`credentials.${credentials.length - 1}.name`);
    setIsNewField(false);
  }, [setFocus, isNewField, setIsNewField, credentials.length]);

  return (
    <Modal
      title={t('CreateSchema.titles.main')}
      isOpen={isOpen}
      handleToggle={(isOpen) => {
        if (!isOpen) resetForm();
        onOpenChange(isOpen);
      }}
    >
      <Row className={cls.form}>
        <form
          id={formName}
          className={cls.form}
          onSubmit={handleSubmit(createSchema)}
        >
          <Column className={cls.topFieldsWrapper}>
            <LogoImageField
              altI18nKey="Common.imageAlts.schemaLogo"
              file={logo}
              selectFile={setLogo}
              className={cls.avatarWrapper}
            />
            <BackgroundColorField
              selectColor={setColor}
              color={color}
              className={cls.bgColorPicker}
            />
          </Column>
          <TextInput
            label={t('CreateSchema.titles.schemaName')}
            {...register('name')}
            control={control}
          />
          <Delimiter />

          <CredentialFields
            control={control}
            register={register}
            credentials={credentials}
            onChangeFields={() => {
              setErrorMessage(undefined);
            }}
          />
        </form>

        <CreateSchemaCredential onCreate={handleOnCredentialFieldCreate} />

        {credentialErrors && (
          <div className={cls.error}>{credentialErrors}</div>
        )}

        <Button
          className={cls.submitBtn}
          type="submit"
          isLoading={isLoading}
          isDisabled={!isValid}
          form={formName}
          fullWidth
        >
          {t('CreateSchema.buttons.submit')}
        </Button>
      </Row>
    </Modal>
  );
};
