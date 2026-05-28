import type { StackNavigationEventMap } from '@react-navigation/stack/lib/typescript/src/types'

import { Screens as BifoldScreens } from '@bifold/core'
import { ParamListBase, RouteConfig, StackNavigationState } from '@react-navigation/native'
import { StackNavigationOptions, TransitionPresets } from '@react-navigation/stack'
import { TFunction } from 'i18next'
import React from 'react'

type ScreenOptions = RouteConfig<
  ParamListBase,
  BifoldScreens,
  StackNavigationState<ParamListBase>,
  StackNavigationOptions,
  StackNavigationEventMap
>

interface ScreenComponents {
  SplashScreen: React.FC
  Terms: React.FC
  Biometry: React.FC
  AttemptLockout: React.FC
  OnboardingScreen: React.FC
  CreatePINScreen: React.FC
  EnterPINScreen: React.FC
}

export const getOnboardingScreens = (t: TFunction, components: ScreenComponents): ScreenOptions[] => [
  {
    name: BifoldScreens.Splash,
    component: components.SplashScreen,
    options: {
      ...TransitionPresets.ModalFadeTransition,
      headerShown: false,
    },
  },
  {
    name: BifoldScreens.Onboarding,
    component: components.OnboardingScreen,
    options: () => ({
      ...TransitionPresets.SlideFromRightIOS,
      title: t('Screens.Onboarding') as string,
      headerShown: false,
      headerLeft: () => false,
    }),
  },
  {
    name: BifoldScreens.Terms,
    options: () => ({
      ...TransitionPresets.SlideFromRightIOS,
      title: t('Screens.Terms') as string,
      headerLeft: () => false,
    }),
    component: components.Terms,
  },
  {
    name: BifoldScreens.CreatePIN,
    component: components.CreatePINScreen,
    initialParams: {},
    options: () => ({
      ...TransitionPresets.SlideFromRightIOS,
      headerShown: false,
    }),
  },
  {
    name: BifoldScreens.Biometry,
    options: () => ({
      ...TransitionPresets.SlideFromRightIOS,
      title: t('Screens.Biometry') as string,
      headerLeft: () => false,
    }),
    component: components.Biometry,
  },
  {
    name: BifoldScreens.EnterPIN,
    component: components.EnterPINScreen,
    options: () => ({
      title: t('Screens.EnterPIN') as string,
      headerShown: false,
      headerLeft: () => false,
    }),
  },
  {
    name: BifoldScreens.AttemptLockout,
    component: components.AttemptLockout,
    options: () => ({
      headerShown: true,
      headerLeft: () => null,
      title: t('Screens.AttemptLockout') as string,
    }),
  },
]
