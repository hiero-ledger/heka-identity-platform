import { DndContext, DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useCallback } from 'react';
import {
  Control,
  FieldArrayWithId,
  UseFieldArrayMove,
  UseFieldArrayRemove,
} from 'react-hook-form';

import {
  CreateSchemaFormData,
  Credential,
} from '@/components/CreateSchema/CreateSchema.form';
import CredentialField from '@/components/CreateSchema/CredentialFields/CredentialField/CredentialField';
import { useSortableSensors } from '@/components/Draggable/Draggable';

interface CredentialFieldsProps {
  control: Control<CreateSchemaFormData>;
  /** The credentials field array, owned by the form (`useFieldArray` in the parent) */
  fields: FieldArrayWithId<CreateSchemaFormData, 'credentials'>[];
  remove: UseFieldArrayRemove;
  move: UseFieldArrayMove;
  onChangeFields?: (field?: Credential) => void;
}

export default function CredentialFields({
  control,
  fields,
  remove,
  move,
  onChangeFields,
}: CredentialFieldsProps) {
  const removeCredential = useCallback(
    (index: number) => {
      remove(index);
      if (onChangeFields) onChangeFields();
    },
    [onChangeFields, remove],
  );

  const sensors = useSortableSensors();

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
      <DndContext
        sensors={sensors}
        onDragEnd={handleDragEnd}
      >
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
