import React, { ChangeEvent, useCallback, useEffect, useState } from 'react';
import { FieldError, Input, Label, TextField } from 'react-aria-components';
import { Controller, FieldValues, Path } from 'react-hook-form';
import { Control, UseFormClearErrors } from 'react-hook-form/dist/types/form';

import VisibilityOffIcon from '@/shared/assets/icons/visibility-off.svg';
import VisibilityOutlineIcon from '@/shared/assets/icons/visibility-outline.svg';
import { classNames } from '@/shared/lib/classNames';

import * as cls from './TextInput.module.scss';

export interface TextInputProps<T extends FieldValues> {
  name: Path<T>;
  label?: string;
  className?: string;
  control: Control<T>;
  clearErrors?: UseFormClearErrors<T>;
  hideText?: boolean;
  onChangeValue?: (value: string) => void;
}

export const TextInput = <T extends FieldValues>({
  name,
  label,
  className,
  control,
  clearErrors,
  hideText,
  onChangeValue,
}: TextInputProps<T>) => {
  const [isTextHidden, setIsTextHidden] = useState<boolean>(!!hideText);

  const toggleIsTextHidden = useCallback(() => {
    setIsTextHidden((isTextHidden) => !isTextHidden);
  }, []);

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState: { error } }) => (
        <TextField
          className={cls.inputWrapper}
          type={isTextHidden ? 'password' : 'text'}
          isInvalid={!!error}
        >
          <div className={cls.labelInputWrapper}>
            <Input
              {...field}
              value={field.value ?? ''}
              className={classNames(cls.input, {}, [className])}
              placeholder={label}
              title={label}
              onChange={(e) => {
                field.onChange(e);
                if (onChangeValue) onChangeValue(e.target.value);
                if (clearErrors && error) {
                  clearErrors(field.name);
                }
              }}
            />
            <Label
              className={cls.label}
              htmlFor={field.name}
            >
              <div className={cls.label_content}>{label}</div>
            </Label>
          </div>
          {hideText &&
            (isTextHidden ? (
              <VisibilityOffIcon
                onClick={toggleIsTextHidden}
                className={cls.visibilityIcon}
              />
            ) : (
              <VisibilityOutlineIcon
                onClick={toggleIsTextHidden}
                className={cls.visibilityIcon}
              />
            ))}
          <FieldError className={cls.error}>
            {error && error.message}
          </FieldError>
        </TextField>
      )}
    />
  );
};

export interface TextInputUncontrolledProps {
  label?: string;
  className?: string;
  required?: boolean;
  initValue?: string;
  onChange?: (value: string) => void;
}

export function TextInputUncontrolled({
  label,
  className,
  required,
  initValue,
  onChange,
}: TextInputUncontrolledProps) {
  const [value, setValue] = useState<string | undefined>(undefined);

  useEffect(() => {
    setValue(initValue);
  }, [initValue]);

  const onChangeHandler = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (!event.target.value) return;

      setValue(event.target.value);
      if (onChange) onChange(event.target.value);
    },
    [onChange],
  );

  return (
    <Input
      type="text"
      value={value}
      className={classNames(cls.input, {}, [className])}
      placeholder={label}
      required={required}
      onChange={onChangeHandler}
    />
  );
}
