import { classNames } from '@/utils/classNames'

import styles from './Grid.module.scss'
import { FlexContainerProps } from './types'

// Copied from heka-identity-service-web-ui `shared/ui/Grid/Column`.
function Column({ children, justifyContent, alignItems, className, onClick, style, bordered }: FlexContainerProps) {
  return (
    <div
      className={classNames(styles.Column, { [styles.border]: bordered }, [className])}
      style={{ justifyContent, alignItems, ...style }}
      onClick={onClick}
    >
      {children}
    </div>
  )
}

export default Column
