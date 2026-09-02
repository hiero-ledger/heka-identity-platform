import { ReactNode } from 'react'

import { useDesktop } from './useMediaQuery'

interface ScreenProps {
  children: ReactNode
}

/** Renders children at ≥ 1024 px only. */
export function DesktopView({ children }: ScreenProps) {
  return useDesktop() ? children : null
}

/**
 * Renders children below 1024 px (mobile + tablet) — identity-service's
 * `MobileView` has the same threshold, so the stacked shell matches.
 */
export function MobileView({ children }: ScreenProps) {
  return useDesktop() ? null : children
}
