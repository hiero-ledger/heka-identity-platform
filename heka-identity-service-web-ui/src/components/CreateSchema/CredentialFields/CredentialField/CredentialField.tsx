import { useSortable } from '@dnd-kit/sortable';
import { Button as AriaButton } from 'react-aria-components';
import { Control, UseFormRegister } from 'react-hook-form';
import { FieldArrayWithId } from 'react-hook-form/dist/types/fieldArray';
import { useTranslation } from 'react-i18next';

import {
  CreateSchemaFormData,
  Credential,
} from '@/components/CreateSchema/CreateSchema.form';
import { Draggable, DraggableArea } from '@/components/Draggable/Draggable';
import DeleteSVG from '@/shared/assets/icons/delete-x.svg';
import DragDropSVG from '@/shared/assets/icons/equal.svg';
import { TextInput } from '@/shared/ui/TextInput';

import * as cls from './CredentialField.module.scss';

interface CredentialFieldProps {
  field: FieldArrayWithId<CreateSchemaFormData | { id: string }>;
  fieldIndex: number;
  control: Control<CreateSchemaFormData>;
  register: UseFormRegister<CreateSchemaFormData>;
  onChangeField?: (field?: Credential) => void;
  onRemoveField?: (index: number) => void;
}

export default function CredentialField({
  field,
  fieldIndex,
  control,
  register,
  onChangeField,
  onRemoveField,
}: CredentialFieldProps) {
  const { t } = useTranslation();

  const sortable = useSortable({ id: field.id });

  return (
    <>
      <Draggable sortable={sortable}>
        <div
          key={field.id}
          className={cls.inputWrapper}
        >
          <div
            title={t('CreateSchema.titles.dndCredential')}
            className={cls.dragAndDropBtn}
          >
            <DraggableArea sortable={sortable}>
              <DragDropSVG
                width={24}
                height={24}
              />
            </DraggableArea>
          </div>

          <TextInput
            {...register(`credentials.${fieldIndex}.name`)}
            label={t('CreateSchema.titles.credentialField')}
            control={control}
            onChangeValue={() => {
              if (onChangeField) onChangeField(field);
            }}
          />
          <div title={t('CreateSchema.titles.deleteCredential')}>
            <AriaButton
              aria-label={t('CreateSchema.titles.deleteCredential')}
              className={cls.deleteBtn}
              onPress={() => {
                if (onRemoveField) onRemoveField(fieldIndex);
              }}
            >
              <DeleteSVG
                width={24}
                height={24}
              />
            </AriaButton>
          </div>
        </div>
      </Draggable>
    </>
  );
}
