import { ReactNode } from 'react'

import { useDesktop } from './useMediaQuery'

interface ScreenProps {
  children: ReactNode
}

export function DesktopView({ children }: ScreenProps) {
  return useDesktop() ? children : null
}

export function MobileView({ children }: ScreenProps) {
  return useDesktop() ? null : children
}
