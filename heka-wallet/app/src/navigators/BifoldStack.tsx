import { ActivityProvider, BifoldError, EventTypes, TOKENS, useServices, useStore, MainStack } from '@bifold/core'
import React, { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { DeviceEventEmitter } from 'react-native'

import { type HekaWalletAgent, useHekaAgent } from '../utils/agent'

// Shutdown waits for every open DIDComm socket to close; a mediator socket that went stale
// in the background can hold it for a minute or more. Stop waiting after this.
export const AGENT_SHUTDOWN_TIMEOUT_MS = 10000

async function shutdownAgentForLockout(agent: HekaWalletAgent): Promise<void> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timedOut = new Promise<'timeout'>((resolve) => {
    timeoutId = setTimeout(() => resolve('timeout'), AGENT_SHUTDOWN_TIMEOUT_MS)
  })

  try {
    const result = await Promise.race([agent.shutdown(), timedOut])
    if (result === 'timeout') {
      console.warn(
        `Agent shutdown did not finish in ${AGENT_SHUTDOWN_TIMEOUT_MS} ms during lockout, dropping the agent`
      )
    }
  } catch (err) {
    console.warn(`Agent shutdown failed during lockout: ${err}`)
  } finally {
    clearTimeout(timeoutId)
  }
}

export const BifoldStack: React.FC = () => {
  const [store, dispatch] = useStore()
  const { t } = useTranslation()
  const [OnBoardingStack, loadState] = useServices([TOKENS.STACK_ONBOARDING, TOKENS.LOAD_STATE])
  const { agent, setAgent } = useHekaAgent()
  const [onboardingComplete, setOnboardingComplete] = useState(false)
  const [shuttingDownAgent, setShuttingDownAgent] = useState<HekaWalletAgent | null>(null)

  const shouldRenderMainStack = useMemo(
    () => onboardingComplete && store.authentication.didAuthenticate,
    [onboardingComplete, store.authentication.didAuthenticate]
  )

  useEffect(() => {
    // if user gets locked out, shut down and erase agent so the onboarding
    // workflow re-runs Splash on re-unlock and re-initializes a fresh agent.
    // An unlock during the shutdown must not cancel this, or the app keeps the shut-down agent.
    if (store.authentication.didAuthenticate || !agent || agent === shuttingDownAgent) return

    setShuttingDownAgent(agent)
    shutdownAgentForLockout(agent).finally(() => {
      setAgent(null)
      setShuttingDownAgent(null)
    })
  }, [store.authentication.didAuthenticate, agent, shuttingDownAgent, setAgent])

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(EventTypes.DID_COMPLETE_ONBOARDING, () => {
      setOnboardingComplete(true)
    })

    return sub.remove
  }, [])

  useEffect(() => {
    // Load state only if it hasn't been loaded yet
    if (store.stateLoaded) return

    loadState(dispatch).catch((err: unknown) => {
      const error = new BifoldError(t('Error.Title1044'), t('Error.Message1044'), (err as Error).message, 1001)

      DeviceEventEmitter.emit(EventTypes.ERROR_ADDED, error)
    })
  }, [dispatch, loadState, t, store.stateLoaded])

  if (shouldRenderMainStack && agent && agent !== shuttingDownAgent) {
    return (
      <ActivityProvider>
        <MainStack />
      </ActivityProvider>
    )
  }

  // @ts-expect-error - TODO: Update expected props to correspond with actual agent setup approach
  return <OnBoardingStack />
}
