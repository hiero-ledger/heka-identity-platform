import { useEffect } from 'react'

const PROPERTY = '--visual-viewport-height'

export function useVisualViewportHeight(): void {
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return

    const update = () => {
      document.documentElement.style.setProperty(PROPERTY, `${Math.floor(viewport.height)}px`)
    }
    update()
    viewport.addEventListener('resize', update)
    return () => {
      viewport.removeEventListener('resize', update)
      document.documentElement.style.removeProperty(PROPERTY)
    }
  }, [])
}
