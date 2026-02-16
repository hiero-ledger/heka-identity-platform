import React, { FC } from 'react';

import { classNames } from '@/shared/lib/classNames';

import { IFlexContainer } from '../types';

import * as cls from './Column.module.scss';

const Column: FC<IFlexContainer> = ({
  children,
  justifyContent,
  alignItems,
  className,
  onClick,
  style,
  bordered,
}: IFlexContainer) => (
  <div
    className={classNames(cls.Column, { [cls.border]: bordered }, [className])}
    style={{ justifyContent, alignItems, ...style }}
    onClick={onClick}
  >
    {children}
  </div>
);

export default Column;
