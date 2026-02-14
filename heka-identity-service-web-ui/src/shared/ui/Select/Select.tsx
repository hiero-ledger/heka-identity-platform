import React, { useCallback, useEffect, useMemo } from 'react';
import {
  Button,
  FieldError,
  Key,
  ListBox,
  ListBoxItem,
  Popover,
  Select as AriaSelect,
  SelectProps as AriaSelectProps,
  SelectValue,
  Text,
} from 'react-aria-components';

import ArrowDropDown from '@/shared/assets/icons/arrow-drop-down.svg';
import { classNames } from '@/shared/lib/classNames';

import * as cls from './Select.module.scss';

export interface SelectOption {
  value: Key;
  content: string;
  isDisabled?: boolean;
}

type AriaSelectPropsType = AriaSelectProps<SelectOption> &
  React.RefAttributes<HTMLDivElement>;

export interface SelectProps extends AriaSelectPropsType {
  items: Iterable<SelectOption>;
  className?: string;
  onSelect?: (value: string) => void;
  description?: string;
  errorMessage?: string;
}

const DEFAULT_PLACEHOLDER = 'Select value';

// todo: Research why the forwardRef is required. Fix it.
export const Select = React.forwardRef((props: SelectProps, ref) => {
  const {
    className,
    placeholder,
    items,
    onSelect,
    description,
    errorMessage,
    ...otherProps
  } = props;
  const [value, setValue] = React.useState<Key | undefined>(
    otherProps.defaultSelectedKey,
  );

  useEffect(() => {
    setValue(otherProps.defaultSelectedKey);
  }, [otherProps.defaultSelectedKey]);

  const onChangeHandler = useCallback(
    (key: Key) => {
      setValue(key);

      if (onSelect) {
        onSelect(key.toString());
      }
    },
    [onSelect],
  );

  const placeholderElement = useMemo(
    () => (
      <div className={cls.valueBox}>
        <span className={cls.placeholder}>
          {placeholder || DEFAULT_PLACEHOLDER}
        </span>
      </div>
    ),
    [placeholder],
  );

  const selectedElement = useMemo(
    () => (
      <div
        className={classNames(cls.valueBox__selected, {
          [cls.valueBox__oneLine]: !placeholder,
        })}
      >
        {placeholder && (
          <span className={cls.placeholder__selected}>{placeholder}</span>
        )}
        <SelectValue className={cls.value} />
      </div>
    ),
    [placeholder],
  );

  return (
    <AriaSelect
      aria-label={placeholder}
      className={classNames(cls.Select, {}, [className])}
      placeholder={placeholder}
      selectedKey={value}
      onSelectionChange={onChangeHandler}
      {...otherProps}
    >
      {({ isInvalid }) => (
        <>
          <Button
            className={classNames(cls.activator, {
              [cls.invalid]: isInvalid,
              [cls.activator__invalid]: isInvalid,
            })}
          >
            {value ? selectedElement : placeholderElement}
            <ArrowDropDown className={cls.arrow} />
          </Button>

          {!isInvalid && description && (
            <Text
              slot="description"
              className={cls.description}
            >
              {description}
            </Text>
          )}

          <FieldError className={cls.error}>{errorMessage}</FieldError>

          <Popover className={cls.popover}>
            <ListBox
              className={cls.listBox}
              items={items}
            >
              {(item) => (
                <ListBoxItem
                  className={cls.listBoxItem}
                  id={item.value}
                  isDisabled={item.isDisabled}
                >
                  {item.content}
                </ListBoxItem>
              )}
            </ListBox>
          </Popover>
        </>
      )}
    </AriaSelect>
  );
});
