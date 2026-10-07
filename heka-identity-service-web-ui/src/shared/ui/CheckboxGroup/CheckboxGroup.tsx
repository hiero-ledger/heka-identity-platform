import { useCallback, useId, useMemo, useState } from 'react';
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

  // Computes the next selection outside the state updater, then updates both this group and
  // the parent: calling the parent's setter from inside an updater is a side effect during render
  const applySelection = useCallback(
    (updatedOptions: Record<string, boolean>) => {
      setSelectedOptions(updatedOptions);
      setSelected(
        Object.keys(updatedOptions).filter((option) => updatedOptions[option]),
      );
    },
    [setSelected],
  );

  const toggleAllCheckboxes = useCallback(() => {
    applySelection(
      options.reduce(
        (prev, option) => ({ ...prev, [option]: !areAllSelected }),
        {} as Record<string, boolean>,
      ),
    );
  }, [applySelection, areAllSelected, options]);

  const toggleCheckbox = useCallback(
    (option: string) => {
      applySelection({
        ...selectedOptions,
        [option]: !selectedOptions[option],
      });
    },
    [applySelection, selectedOptions],
  );

  const idPrefix = useId();
  const optionId = (index: number) => `${idPrefix}-option-${index}`;
  const selectAllId = `${idPrefix}-all`;

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
          id={selectAllId}
          type="checkbox"
          checked={areAllSelected}
          onChange={toggleAllCheckboxes}
          disabled={disabled}
        />

        <label
          htmlFor={selectAllId}
          className={cls.optionsControllerLabel}
        >
          {t('Common.buttons.selectAll')}
        </label>
      </Row>
      {options.map((option, index) => (
        <Row
          key={option}
          justifyContent="flex-start"
          alignItems="center"
          className={cls.option}
        >
          <input
            id={optionId(index)}
            type="checkbox"
            name={option}
            checked={!!selectedOptions[option]}
            onChange={() => toggleCheckbox(option)}
            disabled={disabled}
            value={''}
          />

          <label
            htmlFor={optionId(index)}
            className={cls.optionLabel}
          >
            {option}
          </label>
        </Row>
      ))}
    </Column>
  );
}
