import { CSSProperties, ReactNode } from 'react'

// Copied from heka-identity-service-web-ui `shared/ui/Grid/types`.
type ContentAlign = 'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around'

export interface FlexContainerProps {
  children?: ReactNode
  justifyContent?: ContentAlign
  alignItems?: ContentAlign
  justifySelf?: ContentAlign
  alignSelf?: ContentAlign
  className?: string
  onClick?: () => void
  style?: CSSProperties
  bordered?: boolean
}
