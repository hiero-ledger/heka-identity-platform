import { ActivityProvider, BifoldError, EventTypes, TOKENS, useServices, useStore, MainStack } from '@bifold/core'
import { useAgent } from '@bifold/react-hooks'
import React, { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { DeviceEventEmitter } from 'react-native'

export const BifoldStack: React.FC = () => {
  const [store, dispatch] = useStore()
  const { t } = useTranslation()
  const [OnBoardingStack, loadState] = useServices([TOKENS.STACK_ONBOARDING, TOKENS.LOAD_STATE])
  const { agent, setAgent } = useAgent()
  const [onboardingComplete, setOnboardingComplete] = useState(false)

  const shouldRenderMainStack = useMemo(
    () => onboardingComplete && store.authentication.didAuthenticate,
    [onboardingComplete, store.authentication.didAuthenticate]
  )

  useEffect(() => {
    // if user gets locked out, erase agent
    console.log(`Lock out the user, didAuthenticate: ${store.authentication.didAuthenticate}`)
    if (!store.authentication.didAuthenticate && agent) {
      agent.shutdown()
      // setAgent(null)
    }
  }, [store.authentication.didAuthenticate, agent, setAgent])

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

  if (shouldRenderMainStack) {
    return (
      <ActivityProvider>
        <MainStack />
      </ActivityProvider>
    )
  }

  // @ts-expect-error - TODO: Update expected props to correspond with actual agent setup approach
  return <OnBoardingStack />
}
