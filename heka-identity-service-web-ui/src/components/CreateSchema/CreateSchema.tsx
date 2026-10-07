import { joiResolver } from '@hookform/resolvers/joi';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
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
  createSchemaFormSchema,
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
  // The default logo as a file, once loaded: the form resets to it, not to its path
  const defaultLogoFile = useRef<File | undefined>(undefined);
  const [color, setColor] = useState<string>(defaultSchemaBackgroundColor);

  const [credentialErrors, setErrorMessage] = useState<string | undefined>(
    undefined,
  );

  const formName = 'schema-form';

  const formSchema = useMemo(() => createSchemaFormSchema(t), [t]);

  const {
    handleSubmit,
    control,
    reset,
    formState: { isValid },
    trigger,
  } = useForm<CreateSchemaFormData>({
    defaultValues: CreateSchemaFormDefaultValues,
    resolver: joiResolver(formSchema),
    mode: 'onChange',
    criteriaMode: 'all',
  });

  const resetForm = useCallback(() => {
    setLogo(defaultLogoFile.current ?? defaultLogoImagePath);
    setColor(defaultSchemaBackgroundColor);
    reset(CreateSchemaFormDefaultValues);
  }, [reset]);

  useEffect(() => {
    resetForm();
  }, [resetForm]);

  useEffect(() => {
    const loadDefaultImage = async () => {
      try {
        const response = await fetch(defaultLogoImagePath);
        const blob = await response.blob();
        const defaultFile = new File([blob], DEFAULT_IMAGE_NAME, {
          type: blob.type,
        });
        defaultLogoFile.current = defaultFile;
        // Replace only the placeholder path, never a logo the user has already picked
        setLogo((current) =>
          typeof current === 'string' ? defaultFile : current,
        );
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
      // Only upload a real file. If the default image could not be loaded, send no logo:
      // the schema then shows the default image
      if (logo instanceof File) formData.append('logo', logo);
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

  // The single owner of the credentials array; the field list below only renders it
  const { fields, append, remove, move } = useFieldArray({
    control,
    name: 'credentials',
  });

  const handleOnCredentialFieldCreate = useCallback(
    async (name: string) => {
      // `append` focuses the new field, so typing continues in it
      append({ name });
      setErrorMessage(undefined);
      await trigger();
    },
    [append, trigger],
  );

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
            name="name"
            control={control}
          />
          <Delimiter />

          <CredentialFields
            control={control}
            fields={fields}
            remove={remove}
            move={move}
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
