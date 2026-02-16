import { DndContext, DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useCallback, useEffect } from 'react';
import { Control, useFieldArray, UseFormRegister } from 'react-hook-form';

import {
  CreateSchemaFormData,
  Credential,
} from '@/components/CreateSchema/CreateSchema.form';
import CredentialField from '@/components/CreateSchema/CredentialFields/CredentialField/CredentialField';

interface CredentialFieldsProps {
  control: Control<CreateSchemaFormData>;
  register: UseFormRegister<CreateSchemaFormData>;
  credentials: Credential[];
  onChangeFields?: (field?: Credential) => void;
}

export default function CredentialFields({
  control,
  register,
  credentials,
  onChangeFields,
}: CredentialFieldsProps) {
  const { fields, remove, move } = useFieldArray({
    control,
    name: 'credentials',
  });

  useEffect(() => {
    remove();
    if (onChangeFields) onChangeFields();
    // Attention: Don't add onChangeFields to dependencies array
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remove]);

  const removeCredential = useCallback(
    (index: number) => {
      if (credentials.length) {
        remove(index);
        if (onChangeFields) onChangeFields();
      }
    },
    [credentials, onChangeFields, remove],
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = fields.findIndex((f) => f.id === active.id);
      const newIndex = fields.findIndex((f) => f.id === over.id);
      move(oldIndex, newIndex);
    }
  };

  return (
    <>
      <DndContext onDragEnd={handleDragEnd}>
        <SortableContext
          items={fields.map((f) => ({ id: f.id }))}
          strategy={verticalListSortingStrategy}
        >
          {fields.map((field, index) => (
            <CredentialField
              key={field.id}
              field={field}
              fieldIndex={index}
              control={control}
              register={register}
              onChangeField={() => {
                if (onChangeFields) onChangeFields(field);
              }}
              onRemoveField={(i) => removeCredential(i)}
            />
          ))}
        </SortableContext>
      </DndContext>
    </>
  );
}
