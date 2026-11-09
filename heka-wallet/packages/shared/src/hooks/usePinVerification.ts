import { useAuth } from '@bifold/core'
import { hashPIN } from '@bifold/core/src/utils/crypto'
import { useCallback, useState } from 'react'

import { GlobalLogger } from '../logger'

const logger = GlobalLogger.createContextLogger('PinVerification')

interface PinVerification {
  /** Resolves true for the wallet PIN. A wrong PIN sets `validationError`; a failure is logged and rethrown. */
  verify: (pin: string) => Promise<boolean>
  validationError: boolean
  resetError: () => void
}

/** Checks a PIN against the wallet secret's stored hash. */
export function usePinVerification(): PinVerification {
  const { getWalletSecret } = useAuth()

  const [validationError, setValidationError] = useState(false)

  const verify = useCallback(
    async (pin: string) => {
      try {
        const walletSecret = await getWalletSecret()

        if (!walletSecret) {
          throw new Error('PinConfirmation: Got undefined wallet secret')
        }

        const pinHash = await hashPIN(pin, walletSecret.salt)
        const isPinValid = pinHash === walletSecret.key

        if (!isPinValid) {
          setValidationError(true)
        }
        return isPinValid
      } catch (error) {
        logger.error('PIN verification failed', error)
        throw error
      }
    },
    [getWalletSecret]
  )

  const resetError = useCallback(() => setValidationError(false), [])

  return { verify, validationError, resetError }
}
