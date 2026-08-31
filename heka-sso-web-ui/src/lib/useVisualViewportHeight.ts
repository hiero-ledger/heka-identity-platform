import { useEffect } from 'react'

const PROPERTY = '--visual-viewport-height'

/**
 * Publishes the visual viewport height as `--visual-viewport-height` on
 * `<html>` so full-height shells can follow the on-screen keyboard and the
 * mobile address bar (UI-PLAN.md §2.4). Layouts use it as
 * `min-height: var(--visual-viewport-height, 100dvh)`; browsers without
 * `visualViewport` keep the `dvh` fallback.
 */
export function useVisualViewportHeight(): void {
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return

    const update = () => {
      document.documentElement.style.setProperty(PROPERTY, `${Math.round(viewport.height)}px`)
    }
    update()
    viewport.addEventListener('resize', update)
    return () => {
      viewport.removeEventListener('resize', update)
      document.documentElement.style.removeProperty(PROPERTY)
    }
  }, [])
}
