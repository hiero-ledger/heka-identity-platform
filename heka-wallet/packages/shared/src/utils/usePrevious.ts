import { useEffect, useRef } from 'react'

export function usePrevious<TValue>(state: TValue, initialValue?: TValue): TValue | undefined {
  const ref = useRef<TValue | undefined>(initialValue)

  useEffect(() => {
    ref.current = state
  }, [state])

  return ref.current
}
