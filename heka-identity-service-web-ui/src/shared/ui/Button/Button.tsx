import React, { memo, ReactNode } from 'react';
import {
  Button as AriaButton,
  ButtonProps as AriaButtonProps,
} from 'react-aria-components';

import AddSVG from '@/shared/assets/icons/add.svg';
import ArrowBackSVG from '@/shared/assets/icons/arrow-back.svg';
import CloseBlackSVG from '@/shared/assets/icons/close-black.svg';
import CloseSVG from '@/shared/assets/icons/close.svg';
import DeleteSVG from '@/shared/assets/icons/delete.svg';
import DotsSVG from '@/shared/assets/icons/dots.svg';
import EditSVG from '@/shared/assets/icons/edit.svg';
import ForwardSVG from '@/shared/assets/icons/forward.svg';
import LogoutSVG from '@/shared/assets/icons/logout.svg';
import RegisterSVG from '@/shared/assets/icons/register.svg';
import UserSVG from '@/shared/assets/icons/user.svg';
import { classNames, Mods } from '@/shared/lib/classNames';

import { Loader } from '../Loader';
import { LoaderType } from '../Loader/types';

import * as cls from './Button.module.scss';

type AriaButtonPropsType = AriaButtonProps &
  React.RefAttributes<HTMLButtonElement>;

export type ButtonType =
  | 'filled'
  | 'outlined'
  | 'tonal'
  | 'elevated'
  | 'text'
  | 'shutter';
export type ButtonIcon =
  | 'add'
  | 'arrow-back'
  | 'forward'
  | 'logout'
  | 'user'
  | 'close'
  | 'close-black'
  | 'delete'
  | 'dots'
  | 'edit'
  | 'register';

const buttonIconsMapper: { [name in ButtonIcon]: ReactNode } = {
  add: <AddSVG />,
  'arrow-back': (
    <ArrowBackSVG
      height={24}
      width={24}
      className={cls.icon}
    />
  ),
  forward: (
    <ForwardSVG
      height={24}
      width={24}
      className={cls.icon}
    />
  ),
  logout: (
    <LogoutSVG
      height={24}
      width={24}
      className={cls.icon}
    />
  ),
  user: (
    <UserSVG
      height={32}
      width={32}
      className={cls.icon}
    />
  ),
  close: (
    <CloseSVG
      height={12}
      width={12}
    />
  ),
  'close-black': (
    <CloseBlackSVG
      height={12}
      width={12}
    />
  ),
  delete: (
    <DeleteSVG
      height={24}
      width={24}
    />
  ),
  dots: (
    <DotsSVG
      height={24}
      width={24}
    />
  ),
  edit: (
    <EditSVG
      height={24}
      width={24}
    />
  ),
  register: (
    <RegisterSVG
      height={24}
      width={24}
    />
  ),
};

interface ButtonProps extends AriaButtonPropsType {
  buttonType?: ButtonType;
  isDisabled?: boolean;
  isLoading?: boolean;
  isSmall?: boolean;
  className?: string;
  leftIcon?: ButtonIcon;
  rightIcon?: ButtonIcon;
  children?: ReactNode;
  fullWidth?: boolean;
  alignment?: 'center' | 'left';
}

/** The icon a `Button` shows for `leftIcon`/`rightIcon` */
export const ButtonIconGlyph = ({ name }: { name: ButtonIcon }) => (
  <>{buttonIconsMapper[name]}</>
);

/**
 * The classes of a `Button` with these options. Lets another react-aria element that exposes
 * the same `data-hovered`/`data-pressed`/`data-focus-visible` states (e.g. a `MenuItem`) look
 * like a button without nesting one inside it.
 */
export const buttonClassName = ({
  buttonType = 'filled',
  isSmall,
  alignment,
  fullWidth,
  className,
}: Pick<
  ButtonProps,
  'buttonType' | 'isSmall' | 'alignment' | 'fullWidth' | 'className'
>) => {
  const mods: Mods = {
    [cls.small]: isSmall,
    [cls.leftAligned]: alignment === 'left',
  };
  return classNames(cls.Button, mods, [
    className,
    cls[buttonType],
    fullWidth ? cls.fullWidth : undefined,
  ]);
};

export const Button = memo((props: ButtonProps) => {
  const {
    className,
    children,
    buttonType = 'filled',
    isDisabled,
    isLoading = false,
    isSmall,
    leftIcon,
    rightIcon,
    fullWidth,
    alignment,
    ...otherProps
  } = props;

  return (
    <AriaButton
      className={buttonClassName({
        buttonType,
        isSmall,
        alignment,
        fullWidth,
        className,
      })}
      isDisabled={isDisabled || isLoading}
      {...otherProps}
    >
      {leftIcon && !isLoading && buttonIconsMapper[leftIcon]}
      {children}
      {rightIcon && !isLoading && buttonIconsMapper[rightIcon]}
      {isLoading && (
        <Loader
          size={24}
          type={LoaderType.Linear}
        />
      )}
    </AriaButton>
  );
});

Button.displayName = 'Button';
