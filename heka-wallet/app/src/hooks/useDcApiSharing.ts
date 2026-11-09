import type { DigitalCredentialsRequest } from '@animo-id/expo-digital-credentials-api'

import { TOKENS, useServices } from '@bifold/core'
import { GlobalLogger } from '@heka-wallet/shared'
import { useCallback, useRef, useState } from 'react'

import { dcApiResolveRequest, dcApiSendErrorResponse, dcApiSendResponse } from '../credentials/dcApi'
import { HekaWalletAgent } from '../utils/agent'
import { formatError } from '../utils/error'
import { unlockDcApiAgent } from '../utils/unlockDcApiAgent'

const logger = GlobalLogger.createContextLogger('DcApiSharing')

interface DcApiSharing {
  // Resolves to false when the PIN is wrong and the key pad should be cleared for another try.
  onPinEntered: (pin: string) => Promise<boolean>
  onCancel: () => void
  isProcessing: boolean
  pinError: boolean
}

// Opens the wallet with the entered PIN and answers the Digital Credentials API request exactly once.
export const useDcApiSharing = (request: DigitalCredentialsRequest): DcApiSharing => {
  const [hashPIN] = useServices([TOKENS.FN_PIN_HASH_ALGORITHM])

  const [isProcessing, setIsProcessing] = useState(false)
  const [pinError, setPinError] = useState(false)

  // Guards against sending more than one response (PIN keypad can re-fire; backdrop can be tapped).
  const completedRef = useRef(false)

  const onPinEntered = useCallback(
    async (pin: string): Promise<boolean> => {
      if (completedRef.current) return true

      setPinError(false)
      setIsProcessing(true)

      let agent: HekaWalletAgent | null
      try {
        agent = await unlockDcApiAgent(pin, hashPIN)
      } catch (error) {
        logger.error('Failed to open the wallet for a Digital Credentials API request', {
          error: formatError(error),
        })
        completedRef.current = true
        dcApiSendErrorResponse('Unable to open the wallet')
        return true
      }

      if (!agent) {
        setPinError(true)
        setIsProcessing(false)
        return false
      }

      completedRef.current = true
      try {
        const resolved = await dcApiResolveRequest(agent, request)
        await dcApiSendResponse(agent, resolved)
        return true
      } catch (error) {
        agent.config.logger.error('Failed to build the Digital Credentials API response', {
          error: formatError(error),
        })
        dcApiSendErrorResponse(error instanceof Error ? error.message : 'Unable to share the credential')
        return true
      } finally {
        // Best-effort cleanup, the activity is finishing regardless
        await agent
          .shutdown()
          .catch((error: unknown) =>
            agent.config.logger.warn('DC API agent shutdown failed', { error: formatError(error) })
          )
      }
    },
    [request, hashPIN]
  )

  const onCancel = useCallback(() => {
    if (completedRef.current) return
    completedRef.current = true
    dcApiSendErrorResponse('The request was cancelled')
  }, [])

  return { onPinEntered, onCancel, isProcessing, pinError }
}
