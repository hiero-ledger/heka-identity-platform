import { classNames } from '../../lib/classNames'

import styles from './Grid.module.scss'
import { FlexContainerProps } from './types'

// Copied from heka-identity-service-web-ui `shared/ui/Grid/Row`.
function Row({
  children,
  justifyContent,
  alignItems,
  justifySelf,
  alignSelf,
  className,
  onClick,
  style,
}: FlexContainerProps) {
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
