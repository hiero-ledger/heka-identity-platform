import { tryParseInt } from '@heka-wallet/shared'
import { useCallback, useMemo, useState } from 'react'

export const useZeroOrPositiveIntegerString = (initialValue: string) => {
  const [value, setValue] = useState(initialValue)

  return {
    value,
    setValue: useCallback((text: string) => {
      if (!text) {
        setValue('')
        return
      }

      const num = tryParseInt(text)
      if (num !== null && num >= 0) {
        setValue(num.toString())
      }
    }, []),
    isEmpty: useMemo(() => !value, [value]),
    number: useMemo(() => {
      const num = tryParseInt(value, NaN)
      return Math.max(0, num)
    }, [value]),
  }
}
