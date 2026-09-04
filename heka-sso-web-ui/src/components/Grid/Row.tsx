import { classNames } from '@/utils/classNames'

import styles from './Grid.module.scss'
import { FlexContainerProps } from './types'

function Row({ children, justifyContent, alignItems, justifySelf, alignSelf, className, onClick, style }: FlexContainerProps) {
  return (
    <div
      className={classNames(styles.Row, {}, [className])}
      style={{ justifyContent, alignItems, alignSelf, justifySelf, ...style }}
      onClick={onClick}
    >
      {children}
    </div>
  )
}

export default Row
