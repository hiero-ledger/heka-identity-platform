import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';

import { BackgroundColorField } from '@/components/BackgroundColorField';
import { LogoImageField } from '@/components/LogoImageField';
import { Schema } from '@/entities/Schema';
import { selectSchemaLoading } from '@/entities/Schema/model/selectors/schemasSelector';
import { updateSchemaView } from '@/entities/Schema/model/services/updateSchemaView';
import { UpdateSchemaParams } from '@/entities/Schema/model/types/schema';
import { classNames } from '@/shared/lib/classNames';
import { useAppDispatch } from '@/shared/lib/hooks/useAppDispatch';
import { Button } from '@/shared/ui/Button/Button';
import Column from '@/shared/ui/Grid/Column/Column';
import Row from '@/shared/ui/Grid/Row/Row';
import { Modal } from '@/shared/ui/Modal/Modal';

import * as cls from './EditorView.module.scss';

interface EditorViewProps {
  schema: Schema;
  isOpen: boolean;
  onOpenChange: (value: boolean) => void;
}

export const EditorView = ({
  schema,
  isOpen,
  onOpenChange,
}: EditorViewProps) => {
  const { id: schemaId, name: title, fields, logo, bgColor } = schema;
  const [selectedFile, setSelectedFile] = useState<File | string>('');
  const [selectedColor, setSelectedColor] = useState('');
  const isLoading = useSelector(selectSchemaLoading);

  const dispatch = useAppDispatch();
  const { t } = useTranslation();

  const resetFields = useCallback(() => {
    setSelectedFile('');
    setSelectedColor('');
  }, []);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const params: UpdateSchemaParams['params'] = {};

    if (selectedFile) {
      params.logo = selectedFile as File;
    }

    if (selectedColor) {
      params.bgColor = selectedColor;
    }

    try {
      await dispatch(updateSchemaView({ schemaId, params })).unwrap();
      toast.success(t('SchemaEditView.messages.success'));
      onOpenChange(false);
    } catch {
      /* empty */
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      title={title as string}
      handleToggle={(isOpen) => {
        if (!isOpen) resetFields();
        onOpenChange(isOpen);
      }}
    >
      <Column className={classNames(cls.list, {}, [cls.attributesWrapper])}>
        {fields.map((field) => (
          <Row
            key={field.id}
            justifyContent="flex-start"
            alignItems="center"
            className={cls.item}
          >
            {field.name}
          </Row>
        ))}
      </Column>
      <form onSubmit={handleFormSubmit}>
        <Column className={classNames(cls.list, {}, [cls.attributesWrapper])}>
          <LogoImageField
            altI18nKey="Common.imageAlts.schemaLogo"
            file={selectedFile || (logo as string)}
            selectFile={setSelectedFile}
            className={cls.formField}
          />
          <BackgroundColorField
            className={cls.formField}
            color={selectedColor || (bgColor as string)}
            selectColor={setSelectedColor}
          />
        </Column>
        <Button
          className={cls.submitBtn}
          type="submit"
          isDisabled={!selectedFile && !selectedColor}
          isLoading={isLoading}
        >
          {t('SchemaEditView.buttons.submit')}
        </Button>
      </form>
    </Modal>
  );
};
