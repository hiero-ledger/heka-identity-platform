import { ReactNode } from 'react'

import { classNames } from '@/utils/classNames'

import styles from './Badge.module.scss'

export type BadgeVariant = 'success' | 'neutral'

interface BadgeProps {
  variant?: BadgeVariant
  children: ReactNode
}

function Badge({ variant = 'neutral', children }: BadgeProps) {
  return <span className={classNames(styles.Badge, {}, [styles[variant]])}>{children}</span>
}

export default Badge
