import React from 'react';
import {
  Control,
  Controller,
  FieldValues,
  Path,
  UseFormClearErrors,
} from 'react-hook-form';

import { Select, SelectProps } from '@/shared/ui/Select';

export interface FormSelectProps<T extends FieldValues> extends SelectProps {
  name: Path<T>;
  control: Control<T>;
  clearErrors?: UseFormClearErrors<T>;
}

// todo: Research why the forwardRef is required. Fix it.
export const FormSelect = React.forwardRef(
  <T extends FieldValues>(props: FormSelectProps<T>) => {
    const { name, control, clearErrors } = props;
    return (
      <Controller
        name={name}
        control={control}
        render={({ field, fieldState: { invalid, error } }) => (
          <Select
            {...props}
            defaultSelectedKey={field.value}
            onSelect={(value) => {
              field.onChange(value);
              if (props.onSelect) {
                props.onSelect(value);
              }
              if (clearErrors && error) {
                clearErrors(name);
              }
            }}
            isInvalid={invalid}
            errorMessage={error?.message}
          />
        )}
      />
    );
  },
);
