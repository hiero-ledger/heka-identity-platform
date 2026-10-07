import { useTranslation } from 'react-i18next';

import { useMobile } from '@/components/Screen/Screen';
import AddSVG from '@/shared/assets/icons/add.svg';
import { clickableProps } from '@/shared/lib/a11y/clickable';
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
  /** Accessible name of the option group */
  label?: string;
  /** Accessible name of the create button; defaults to "Create" */
  createLabel?: string;
}

export function ButtonCards({
  selected,
  options,
  onChange,
  onCreate,
  direction = 'row',
  limitWidth,
  label,
  createLabel,
}: ButtonCardsProps) {
  const { t } = useTranslation();
  const isMobile = useMobile();
  const columnDirection =
    direction === 'column' || (isMobile && options.length > 3);

  return (
    <div
      role="radiogroup"
      aria-label={label}
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
          title={option.content}
          {...clickableProps(() => onChange(option.value), {
            role: 'radio',
            checked: option.value === selected,
          })}
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
          {...clickableProps(onCreate, {
            label: createLabel ?? t('Common.buttons.create'),
          })}
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
