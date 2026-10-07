import React, { CSSProperties } from 'react';

type ContentAlign =
  | 'flex-start'
  | 'flex-end'
  | 'center'
  | 'space-between'
  | 'space-around';

/** Layout props, plus any other `div` attributes (role, tabIndex, aria-*, key handlers) */
export interface IFlexContainer
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onClick' | 'style'> {
  children?: React.ReactNode;
  justifyContent?: ContentAlign;
  alignItems?: ContentAlign;
  justifySelf?: ContentAlign;
  alignSelf?: ContentAlign;
  className?: string;
  onClick?: () => void;
  style?: CSSProperties;
  bordered?: boolean;
}
