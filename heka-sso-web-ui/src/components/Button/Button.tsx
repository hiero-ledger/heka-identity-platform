import { ReactNode } from 'react'
import { Button as AriaButton, ButtonProps as AriaButtonProps } from 'react-aria-components'

import ArrowBackIcon from '@/assets/icons/arrow-back.svg?react'
import LogoutIcon from '@/assets/icons/logout.svg?react'
import UserIcon from '@/assets/icons/user.svg?react'
import { classNames, Mods } from '@/utils/classNames'

import styles from './Button.module.scss'

export type ButtonType = 'filled' | 'outlined' | 'tonal' | 'text'
export type ButtonIcon = 'arrow-back' | 'logout' | 'user'

const icons: Record<ButtonIcon, ReactNode> = {
  'arrow-back': <ArrowBackIcon className={styles.icon} aria-hidden="true" />,
  logout: <LogoutIcon className={styles.icon} aria-hidden="true" />,
  user: <UserIcon className={styles.icon} aria-hidden="true" />,
}

export interface ButtonProps extends Omit<AriaButtonProps, 'className' | 'children'> {
  buttonType?: ButtonType
  isSmall?: boolean
  fullWidth?: boolean
  alignment?: 'center' | 'left'
  leftIcon?: ButtonIcon
  rightIcon?: ButtonIcon
  className?: string
  children?: ReactNode
}

function Button({ buttonType = 'filled', isSmall, fullWidth, alignment, leftIcon, rightIcon, className, children, ...props }: ButtonProps) {
  const mods: Mods = {
    [styles.small]: isSmall,
    [styles.fullWidth]: fullWidth,
    [styles.leftAligned]: alignment === 'left',
  }
  return (
    <AriaButton className={classNames(styles.Button, mods, [styles[buttonType], className])} {...props}>
      {leftIcon && icons[leftIcon]}
      {children}
      {rightIcon && icons[rightIcon]}
    </AriaButton>
  )
}

export default Button
