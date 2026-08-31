import { ReactNode } from 'react'

import SuccessIcon from '@/assets/icons/success.svg?react'
import { classNames } from '@/utils/classNames'

import styles from './Badge.module.scss'

export type BadgeVariant = 'success' | 'neutral'

interface BadgeProps {
  variant?: BadgeVariant
  children: ReactNode
}

/** Inline status chip: label-m, radius-sm (UI-PLAN.md §3). */
function Badge({ variant = 'neutral', children }: BadgeProps) {
  return (
    <span className={classNames(styles.Badge, {}, [styles[variant]])}>
      {variant === 'success' && <SuccessIcon className={styles.icon} aria-hidden="true" />}
      {children}
    </span>
  )
}

export default Badge
