import {
  DispatchAction,
  EventTypes,
  OnboardingStackParams,
  OnboardingTask,
  TOKENS,
  useServices,
  useStore,
  State,
  Config,
  AttemptLockout,
  useDefaultStackOptions,
} from '@bifold/core'
import { Agent } from '@credo-ts/core'
import { useHekaTheme } from '@heka-wallet/shared'
import { StackActions, useNavigation, useNavigationState } from '@react-navigation/native'
import { StackNavigationProp, createStackNavigator } from '@react-navigation/stack'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DeviceEventEmitter } from 'react-native'

import { useHekaAgent } from '../utils/agent'

import { getOnboardingScreens } from './OnboardingScreens'

const Stack = createStackNavigator()

const useOnboardingState = (
  store: State,
  config: Config,
  termsVersion: number,
  agent: Agent | null,
  generateOnboardingWorkflowSteps: (
    store: State,
    config: Config,
    termsVersion: number,
    agent: Agent | null
  ) => OnboardingTask[]
): {
  onboardingState: OnboardingTask[]
  setOnboardingState: React.Dispatch<React.SetStateAction<OnboardingTask[]>>
  activeScreen: string | undefined
  isComplete: boolean
} => {
  const [onboardingState, setOnboardingState] = useState<OnboardingTask[]>([])

  const activeScreen = useMemo(() => {
    return onboardingState.find((task) => !task.completed)?.name
  }, [onboardingState])

  useEffect(() => {
    if (!store.stateLoaded) {
      return
    }

    const onboardingTasks = generateOnboardingWorkflowSteps(store, config, termsVersion, agent)
    setOnboardingState(onboardingTasks)
  }, [store, config, termsVersion, agent, generateOnboardingWorkflowSteps])

  return {
    onboardingState,
    setOnboardingState,
    activeScreen,
    isComplete: !activeScreen,
  }
}

export const OnboardingStack: React.FC = () => {
  const [store, dispatch] = useStore()
  const { t } = useTranslation()
  const theme = useHekaTheme()
  const [
    config,
    Splash,
    Biometry,
    Onboarding,
    { screen: Terms, version: termsVersion },
    PINCreate,
    PINEnter,
    versionMonitor,
    generateOnboardingWorkflowSteps,
  ] = useServices([
    TOKENS.CONFIG,
    TOKENS.SCREEN_SPLASH,
    TOKENS.SCREEN_BIOMETRY,
    TOKENS.SCREEN_ONBOARDING,
    TOKENS.SCREEN_TERMS,
    TOKENS.SCREEN_PIN_CREATE,
    TOKENS.SCREEN_PIN_ENTER,
    TOKENS.UTIL_APP_VERSION_MONITOR,
    TOKENS.ONBOARDING,
  ])
  const defaultStackOptions = useDefaultStackOptions(theme)
  const navigation = useNavigation<StackNavigationProp<OnboardingStackParams>>()
  const currentRoute = useNavigationState((state) => {
    const stackRouteState = state?.routes[state?.index].state
    return stackRouteState?.routes[stackRouteState?.index ?? 0]
  })
  const { disableOnboardingSkip } = config

  const { agent } = useHekaAgent()

  const { activeScreen } = useOnboardingState(
    store,
    config,
    Number(termsVersion),
    agent ?? null,
    generateOnboardingWorkflowSteps
  )

  useEffect(() => {
    versionMonitor?.checkForUpdate?.().then((versionInfo) => {
      dispatch({
        type: DispatchAction.SET_VERSION_INFO,
        payload: [versionInfo],
      })
    })
  }, [versionMonitor, dispatch])

  const onAuthenticated = useCallback(
    (status: boolean): void => {
      if (!status) {
        return
      }

      dispatch({
        type: DispatchAction.DID_AUTHENTICATE,
      })
    },
    [dispatch]
  )

  const SplashScreen = useCallback(() => {
    // @ts-expect-error - Heka vs. Bifold props type mismatch
    return <Splash />
  }, [Splash])

  const OnboardingScreen = useCallback(() => {
    return (
      // @ts-expect-error - Heka vs. Bifold props type mismatch
      <Onboarding
        nextButtonText={t('Global.Next')}
        previousButtonText={t('Global.Back')}
        disableSkip={disableOnboardingSkip}
      />
    )
  }, [Onboarding, disableOnboardingSkip, t])

  // These need to be in the children of the stack screen otherwise they
  // will unmount/remount which resets the component state in memory and causes
  // issues
  const CreatePINScreen = useCallback(
    (props: any) => {
      return <PINCreate setAuthenticated={onAuthenticated} {...props} />
    },
    [PINCreate, onAuthenticated]
  )

  const EnterPINScreen = useCallback(
    (props: any) => {
      return <PINEnter setAuthenticated={onAuthenticated} {...props} />
    },
    [PINEnter, onAuthenticated]
  )

  useEffect(() => {
    // If the active screen is the same as the current route, then we don't
    // need to do anything.
    if (activeScreen && activeScreen === currentRoute?.name) {
      return
    }

    // If the active screen is different from the current route, then we need
    // to navigate to the active screen.
    if (activeScreen) {
      navigation.dispatch(StackActions.replace(activeScreen))
      return
    }

    // Nothing to do here, we are done with onboarding.
    DeviceEventEmitter.emit(EventTypes.DID_COMPLETE_ONBOARDING)
  }, [activeScreen, currentRoute, navigation])

  const screens = useMemo(() => {
    return getOnboardingScreens(t, {
      SplashScreen,
      Terms,
      Biometry,
      AttemptLockout,
      OnboardingScreen,
      CreatePINScreen,
      EnterPINScreen,
    }).map((item) => {
      return <Stack.Screen key={item.name} {...item} />
    })
  }, [Biometry, CreatePINScreen, EnterPINScreen, OnboardingScreen, SplashScreen, Terms, t])

  return (
    <Stack.Navigator
      initialRouteName={activeScreen}
      screenOptions={{
        ...defaultStackOptions,
      }}
    >
      {screens}
    </Stack.Navigator>
  )
}
