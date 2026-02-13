import React, { FC } from 'react';

import { classNames } from '@/shared/lib/classNames';

import { IFlexContainer } from '../types';

import * as cls from './Row.module.scss';

const Row: FC<IFlexContainer> = ({
  children,
  justifyContent,
  alignItems,
  justifySelf,
  alignSelf,
  className,
  onClick,
  style,
}: IFlexContainer) => (
  <div
    className={classNames(cls.Row, {}, [className])}
    style={{ justifyContent, alignItems, alignSelf, justifySelf, ...style }}
    onClick={onClick}
  >
    {children && children}
  </div>
);

export default Row;
