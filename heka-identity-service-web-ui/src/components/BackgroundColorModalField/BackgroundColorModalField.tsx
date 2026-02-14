import { useCallback, useEffect, useRef, useState } from 'react';
import { Input } from 'react-aria-components';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { EditField } from '@/components/EditField/EditField';
import { EditForm } from '@/components/EditForm';
import { classNames } from '@/shared/lib/classNames';
import { Modal } from '@/shared/ui/Modal/Modal';

import * as cls from './BackgroundColorModalField.module.scss';

export interface BackgroundColorFormData {
  color: string;
}

interface BackgroundColorFieldProp {
  alignOnStart?: boolean;
  color: string;
  submitColor: (data: BackgroundColorFormData) => void;
  className?: string;
  isLoading?: boolean;
}

export const BackgroundColorModalField = ({
  alignOnStart,
  color,
  submitColor,
  className,
  isLoading,
}: BackgroundColorFieldProp) => {
  const colorInputRef = useRef<HTMLInputElement | null>(null);

  const { t } = useTranslation();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formValue, setFormValue] = useState({ color });

  const { handleSubmit, reset } = useForm<BackgroundColorFormData>({
    defaultValues: formValue,
    mode: 'onChange',
  });

  useEffect(() => {
    setFormValue({ color });
  }, [color]);

  const resetForm = useCallback(() => {
    reset({ color });
    setFormValue({ color });
  }, [color, reset]);

  const onSubmitHandle = useCallback(() => {
    submitColor(formValue);
    resetForm();
    setIsModalOpen(false);
  }, [formValue, resetForm, submitColor]);

  return (
    <>
      <EditField
        isLoading={isLoading}
        alignOnStart={alignOnStart}
        className={classNames(className ?? '', {}, ['color-picker'])}
        onPress={() => {
          colorInputRef.current?.click();
          setIsModalOpen(true);
        }}
        labelKey="Common.buttons.background"
      >
        <div
          className={cls.colorSwatch}
          style={{ backgroundColor: color }}
        />
      </EditField>
      <Modal
        title={t('Common.buttons.background')}
        isOpen={isModalOpen}
        handleToggle={(isOpen) => {
          if (!isOpen) resetForm();
          setIsModalOpen(isOpen);
        }}
      >
        <EditForm
          onSubmit={handleSubmit(onSubmitHandle)}
          isSubmitDisabled={color === formValue.color}
          submitLabel="Profile.buttons.submit"
        >
          <Input
            ref={colorInputRef}
            className={cls.colorInput}
            type="color"
            value={formValue.color}
            onChange={(e) =>
              setFormValue({ color: (e.target as HTMLInputElement).value })
            }
          />
        </EditForm>
      </Modal>
    </>
  );
};
