import { ReactNode } from 'react'

import { classNames } from '@/utils/classNames'

import styles from './KeyValueList.module.scss'

export interface KeyValueItem {
  key: string
  label: ReactNode
  value: ReactNode
}

interface KeyValueListProps {
  items: KeyValueItem[]
  className?: string
}

/**
 * Label/value rows: two columns on desktop, label stacked over value when the shell is stacked.
 */
function KeyValueList({ items, className }: KeyValueListProps) {
  return (
    <dl className={classNames(styles.list, {}, [className])}>
      {items.map((item) => (
        <div className={styles.row} key={item.key}>
          <dt className={styles.label}>{item.label}</dt>
          <dd className={styles.value}>{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

export default KeyValueList
