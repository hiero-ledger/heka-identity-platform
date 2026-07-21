import { useDefaultStackOptions } from '@bifold/core'
import { useHekaTheme } from '@heka-wallet/shared'
import { createStackNavigator } from '@react-navigation/stack'
import React from 'react'

import { Login } from '../screens'

import { AuthStackParams, Screens } from './types'

const Stack = createStackNavigator<AuthStackParams>()

export const AuthStack: React.FC = () => {
  const theme = useHekaTheme()
  const defaultStackOptions = useDefaultStackOptions(theme)

  return (
    <Stack.Navigator initialRouteName={Screens.Login} screenOptions={defaultStackOptions}>
      <Stack.Screen name={Screens.Login} component={Login} />
    </Stack.Navigator>
  )
}
