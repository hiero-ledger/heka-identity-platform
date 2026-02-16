import React from 'react';

import { useMobile } from '@/components/Screen/Screen';
import AddSVG from '@/shared/assets/icons/add.svg';
import { classNames } from '@/shared/lib/classNames';
import { Column } from '@/shared/ui/Grid';

import * as cls from './ButtonCards.module.scss';

export interface ButtonCardsOption {
  value: string;
  content: string;
}

export interface ButtonCardsProps {
  selected?: string;
  options: Array<ButtonCardsOption>;
  onChange: (option: string) => void;
  direction?: 'row' | 'column';
  limitWidth?: boolean;
  onCreate?: () => void;
}

export function ButtonCards({
  selected,
  options,
  onChange,
  onCreate,
  direction = 'row',
  limitWidth,
}: ButtonCardsProps) {
  const isMobile = useMobile();
  const columnDirection =
    direction === 'column' || (isMobile && options.length > 3);

  return (
    <div
      className={classNames(cls.ButtonGroup, {
        [cls.ButtonGroupRow]: !columnDirection,
        [cls.ButtonGroupColumn]: columnDirection,
      })}
    >
      {options.map((option) => (
        <div
          key={option.value}
          className={classNames(cls.Button, {
            [cls.ButtonSelected]: option.value === selected,
            [cls.ButtonGroupRow]: columnDirection,
            [cls.ButtonGroupColumn]: !columnDirection,
            [cls.limitWidth]: limitWidth,
          })}
          onClick={() => onChange(option.value)}
          title={option.content}
        >
          <Column
            justifyContent="center"
            alignItems="center"
            className={classNames(cls.circle)}
          >
            {option.value === selected && (
              <Column className={classNames(cls.circleInner)} />
            )}
          </Column>
          <p className={cls.ButtonText}>{option.content}</p>
        </div>
      ))}
      {onCreate && (
        <div
          className={classNames(cls.ButtonCreate)}
          onClick={onCreate}
        >
          <AddSVG
            width={24}
            height={24}
          />
        </div>
      )}
    </div>
  );
}
