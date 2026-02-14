import React, { ChangeEvent, useCallback, useEffect, useState } from 'react';
import { TextArea } from 'react-aria-components';

import { classNames } from '@/shared/lib/classNames';

import * as cls from './TextArea.module.scss';

export interface TextAreaProps {
  label?: string;
  initValue?: string;
  onChange?: (value: string) => void;
  className?: string;
  disabled?: boolean;
}

const TextAreaComponent = ({
  label,
  initValue,
  className,
  onChange,
  disabled,
}: TextAreaProps) => {
  const [value, setValue] = useState<string | undefined>(undefined);

  useEffect(() => {
    setValue(initValue);
  }, [initValue]);

  const onChangeHandler = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      if (!event.target.value) return;
      setValue(event.target.value);
      if (onChange) {
        onChange(event.target.value);
      }
    },
    [onChange],
  );

  return (
    <TextArea
      disabled={disabled}
      title={label}
      value={value}
      onChange={onChangeHandler}
      className={classNames(cls.textArea, {}, [className])}
      placeholder={label}
    />
  );
};

export { TextAreaComponent as TextArea };
