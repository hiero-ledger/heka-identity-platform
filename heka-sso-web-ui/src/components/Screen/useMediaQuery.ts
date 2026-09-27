import { useCallback, useSyncExternalStore } from 'react'

export const breakpoints = {
  mobile: 640,
  desktop: 1024,
} as const

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query)
      media.addEventListener('change', onChange)
      return () => media.removeEventListener('change', onChange)
    },
    [query]
  )
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false
  )
}

export function useDesktop(): boolean {
  return useMediaQuery(`(min-width: ${breakpoints.desktop}px)`)
}

export function useMobile(): boolean {
  return useMediaQuery(`(max-width: ${breakpoints.mobile}px)`)
}

export function useTablet(): boolean {
  return useMediaQuery(`(min-width: ${breakpoints.mobile + 1}px) and (max-width: ${breakpoints.desktop - 1}px)`)
}
