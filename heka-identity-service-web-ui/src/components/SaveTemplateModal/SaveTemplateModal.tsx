import { joiResolver } from '@hookform/resolvers/joi';
import { useCallback } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/ui/Button';
import { Modal } from '@/shared/ui/Modal/Modal';
import { TextInput } from '@/shared/ui/TextInput/TextInput';

import {
  TemplateFieldValidation,
  TemplateFormData,
  TemplateFormDefaultValues,
} from './SaveTemplateModal.form';

import * as cls from './SaveTemplateModal.module.scss';

interface SaveAsTemplateProps {
  isOpen: boolean;
  isLoading: boolean;
  onSave: (name: string) => Promise<void>;
  onOpenChange: (value: boolean) => void;
}

export const SaveTemplateModal = ({
  isOpen,
  isLoading,
  onSave,
  onOpenChange,
}: SaveAsTemplateProps) => {
  const { t } = useTranslation();

  const {
    handleSubmit,
    control,
    reset,
    formState: { isDirty, isValid },
  } = useForm<TemplateFormData>({
    resolver: joiResolver(TemplateFieldValidation),
    defaultValues: TemplateFormDefaultValues,
    mode: 'onChange',
  });

  const handleTemplateSave = useCallback(
    async ({ name }: TemplateFormData) => {
      try {
        await onSave(name);
        toast.success(t('Template.messages.createSuccess', { name }));
        reset(TemplateFormDefaultValues);
        onOpenChange(false);
      } catch {
        reset(TemplateFormDefaultValues);
      }
    },
    [t, reset, onOpenChange, onSave],
  );

  const handleModalToggle = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) reset(TemplateFormDefaultValues);
      onOpenChange(isOpen);
    },
    [onOpenChange, reset],
  );

  return (
    <Modal
      title={t('Template.titles.main')}
      isOpen={isOpen}
      handleToggle={handleModalToggle}
    >
      <form
        onSubmit={handleSubmit(handleTemplateSave)}
        className={cls.form}
      >
        <TextInput
          label={t('Template.titles.templateName')}
          name="name"
          control={control}
        />
        <Button
          className={cls.submitBtn}
          isDisabled={!isDirty || !isValid}
          isLoading={isLoading}
          type="submit"
        >
          {t('Template.buttons.submit')}
        </Button>
      </form>
    </Modal>
  );
};
