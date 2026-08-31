import { ReactNode } from 'react'

import { classNames } from '../../lib/classNames'

import styles from './Card.module.scss'

interface CardProps {
  title?: string
  className?: string
  children: ReactNode
}

/** White surface card: radius-lg, shadow-small (UI-PLAN.md §3). */
function Card({ title, className, children }: CardProps) {
  return (
    <section className={classNames(styles.Card, {}, [className])}>
      {title && <h2 className={styles.title}>{title}</h2>}
      {children}
    </section>
  )
}

export default Card
