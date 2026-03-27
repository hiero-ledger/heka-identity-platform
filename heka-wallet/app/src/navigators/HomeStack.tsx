import { Screens as BifoldScreens, useDefaultStackOptions } from '@bifold/core'
import { HomeStackParams } from '@bifold/core/src/types/navigators'
import { useHekaTheme } from '@heka-wallet/shared'
import { createStackNavigator } from '@react-navigation/stack'
import React from 'react'

import { Home } from '../screens'

const Stack = createStackNavigator<HomeStackParams>()

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
    </Stack.Navigator>
  )
}
