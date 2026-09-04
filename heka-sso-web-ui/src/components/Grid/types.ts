import { CSSProperties, ReactNode } from 'react'

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
