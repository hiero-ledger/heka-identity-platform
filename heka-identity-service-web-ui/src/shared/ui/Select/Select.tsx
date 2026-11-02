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

export interface SelectProps extends AriaSelectProps<SelectOption> {
  items: Iterable<SelectOption>;
  className?: string;
  onSelect?: (value: string) => void;
  description?: string;
  errorMessage?: string;
}

const DEFAULT_PLACEHOLDER = 'Select value';

export const Select = (props: SelectProps) => {
  const {
    className,
    placeholder,
    items,
    onSelect,
    description,
    errorMessage,
    defaultSelectedKey,
    ...otherProps
  } = props;
  const [value, setValue] = React.useState<Key | undefined>(defaultSelectedKey);

  useEffect(() => {
    setValue(defaultSelectedKey);
  }, [defaultSelectedKey]);

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
      // `null` = controlled with nothing selected; `undefined` would make react-aria switch from
      // uncontrolled to controlled on the first choice
      selectedKey={value ?? null}
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
};
