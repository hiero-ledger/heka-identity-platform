import { ActivityProvider, BifoldError, EventTypes, TOKENS, useServices, useStore, MainStack } from '@bifold/core'
import React, { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { DeviceEventEmitter } from 'react-native'

import { useShuttingDownAgent } from '../contexts/AgentLockout'
import { useHekaAgent } from '../utils/agent'

export const BifoldStack: React.FC = () => {
  const [store, dispatch] = useStore()
  const { t } = useTranslation()
  const [OnBoardingStack, loadState] = useServices([TOKENS.STACK_ONBOARDING, TOKENS.LOAD_STATE])
  const { agent } = useHekaAgent()
  // AgentLockoutProvider shuts the agent down on lockout
  const shuttingDownAgent = useShuttingDownAgent()
  const [onboardingComplete, setOnboardingComplete] = useState(false)

  const shouldRenderMainStack = useMemo(
    () => onboardingComplete && store.authentication.didAuthenticate,
    [onboardingComplete, store.authentication.didAuthenticate]
  )

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
