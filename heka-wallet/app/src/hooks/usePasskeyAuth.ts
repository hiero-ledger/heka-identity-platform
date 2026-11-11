import { GlobalLogger } from '@heka-wallet/shared'
import { useIsFocused } from '@react-navigation/native'
import { useCallback, useEffect, useState } from 'react'

import { useRootStore } from '../contexts'
import { formatError } from '../utils/error'

const logger = GlobalLogger.createContextLogger('PasskeyAuth')

type PasskeyAction = 'register' | 'authenticate'

interface PasskeyAuth {
  register: () => Promise<void>
  authenticate: () => Promise<void>
  isLoading: boolean
  error?: unknown
}

/**
 * Registers or authenticates the device user with a passkey. A failure is logged and returned as
 * `error`; `onComplete` runs only on success.
 */
export function usePasskeyAuth(onComplete: () => void): PasskeyAuth {
  const { passkeysStore } = useRootStore()

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<unknown>()
  const isScreenFocused = useIsFocused()

  // Workaround for loading state on iOS if device was locked during auth process
  useEffect(() => {
    if (isScreenFocused) {
      setIsLoading(false)
    }
  }, [isScreenFocused])

  const run = useCallback(
    async (action: PasskeyAction) => {
      setIsLoading(true)
      setError(undefined)
      try {
        const user = await passkeysStore.getUser()
        await passkeysStore[action](user)
        onComplete()
      } catch (e) {
        logger.error('Passkey auth failed', { action, error: formatError(e) })
        setError(e)
      } finally {
        setIsLoading(false)
      }
    },
    [passkeysStore, onComplete]
  )

  const register = useCallback(() => run('register'), [run])
  const authenticate = useCallback(() => run('authenticate'), [run])

  return { register, authenticate, isLoading, error }
}
