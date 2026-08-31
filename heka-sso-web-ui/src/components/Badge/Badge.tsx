import { ReactNode } from 'react'

import { classNames } from '@/utils/classNames'

import styles from './Badge.module.scss'

export type BadgeVariant = 'success' | 'neutral'

interface BadgeProps {
  variant?: BadgeVariant
  children: ReactNode
}

/** Inline status chip: label-m, radius-sm (UI-PLAN.md §3). Text only — no icon glyph in the asset set yet. */
function Badge({ variant = 'neutral', children }: BadgeProps) {
  return <span className={classNames(styles.Badge, {}, [styles[variant]])}>{children}</span>
}

export default Badge
