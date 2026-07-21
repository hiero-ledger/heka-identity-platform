import { Screens as BifoldScreens, Stacks as BifoldStacks, useDefaultStackOptions } from '@bifold/core'
import { HomeStackParams } from '@bifold/core/src/types/navigators'
import { useHekaTheme } from '@heka-wallet/shared'
import { createStackNavigator } from '@react-navigation/stack'
import React from 'react'

import { Home } from '../screens'

import { CredentialStack } from './CredentialStack'

const Stack = createStackNavigator<HomeStackParams & { [BifoldStacks.CredentialStack]: undefined }>()

export const HomeStack: React.FC = () => {
  const theme = useHekaTheme()

  const defaultStackOptions = useDefaultStackOptions(theme)

  return (
    <Stack.Navigator screenOptions={defaultStackOptions}>
      <Stack.Screen
        name={BifoldScreens.Home}
        component={Home}
        options={() => ({
          headerShown: false,
        })}
      />
      <Stack.Screen name={BifoldStacks.CredentialStack} component={CredentialStack} options={{ headerShown: false }} />
    </Stack.Navigator>
  )
}
