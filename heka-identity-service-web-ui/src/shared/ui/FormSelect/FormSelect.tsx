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

/**
 * A `Select` bound to a react-hook-form field. Pass `name` and `control`; do not spread
 * `register()` into it, since the field is registered by the `Controller` here.
 */
export const FormSelect = <T extends FieldValues>({
  name,
  control,
  clearErrors,
  onSelect,
  ...selectProps
}: FormSelectProps<T>) => (
  <Controller
    name={name}
    control={control}
    render={({ field, fieldState: { invalid, error } }) => (
      <Select
        {...selectProps}
        defaultSelectedKey={field.value}
        onSelect={(value) => {
          field.onChange(value);
          if (onSelect) onSelect(value);
          if (clearErrors && error) clearErrors(name);
        }}
        isInvalid={invalid}
        errorMessage={error?.message}
      />
    )}
  />
);
