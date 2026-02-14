import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { classNames } from '@/shared/lib/classNames';
import { Column, Row } from '@/shared/ui/Grid';

import * as cls from './CheckboxGroup.module.scss';

export interface CheckboxGroupProps {
  options: Array<string>;
  initial?: Array<string>;
  setSelected: (option: Array<string>) => void;
  disabled?: boolean;
}

export function CheckboxGroup({
  options,
  initial,
  setSelected,
  disabled,
}: CheckboxGroupProps) {
  const { t } = useTranslation();

  const [selectedOptions, setSelectedOptions] = useState<
    Record<string, boolean>
  >(
    initial?.reduce(
      (prev, option) => ({
        ...prev,
        [option]: true,
      }),
      {},
    ) ?? {},
  );

  const areAllSelected = useMemo(() => {
    return (
      options.length ===
      Object.keys(selectedOptions).filter((option) => selectedOptions[option])
        .length
    );
  }, [options.length, selectedOptions]);

  const toggleAllCheckboxes = useCallback(() => {
    setSelectedOptions((prev) => {
      const allSelected =
        options.length ===
        Object.keys(prev).filter((option) => prev[option]).length;
      const updatedOptions: Record<string, boolean> = options.reduce(
        (prev, option) => ({
          ...prev,
          [option]: !allSelected,
        }),
        {},
      );
      setSelected(
        Object.keys(updatedOptions).filter((option) => updatedOptions[option]),
      );
      return updatedOptions;
    });
  }, [options, setSelected]);

  const toggleCheckbox = useCallback(
    (option: string) => {
      setSelectedOptions((prev) => {
        const updatedOptions = { ...prev, [option]: !prev[option] };
        setSelected(
          Object.keys(updatedOptions).filter((key) => updatedOptions[key]),
        );
        return updatedOptions;
      });
    },
    [setSelected],
  );

  if (!options.length) {
    return null;
  }

  return (
    <Column
      justifyContent="flex-start"
      alignItems="center"
      className={cls.CheckboxGroup}
    >
      <Row
        justifyContent="flex-start"
        alignItems="center"
        className={classNames(cls.option, {}, [cls.optionsController])}
      >
        <input
          type="checkbox"
          checked={areAllSelected}
          onChange={toggleAllCheckboxes}
          disabled={disabled}
        />

        <p className={cls.optionsControllerLabel}>
          {t('Common.buttons.selectAll')}
        </p>
      </Row>
      {options.map((option) => (
        <Row
          key={option}
          justifyContent="flex-start"
          alignItems="center"
          className={cls.option}
        >
          <input
            type="checkbox"
            name={option}
            checked={selectedOptions[option]}
            onChange={() => toggleCheckbox(option)}
            disabled={disabled}
            value={''}
          />

          <p className={cls.optionLabel}>{option}</p>
        </Row>
      ))}
    </Column>
  );
}
