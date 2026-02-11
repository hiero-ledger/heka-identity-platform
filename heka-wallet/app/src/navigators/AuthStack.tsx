import { useHekaTheme } from '@heka-wallet/shared'
import { useDefaultStackOptions } from '@hyperledger/aries-bifold-core/App/navigators/defaultStackOptions'
import { createStackNavigator } from '@react-navigation/stack'
import React from 'react'

import { Login } from '../screens'

import { AuthStackParams, Screens } from './types'

export const AuthStack: React.FC = () => {
  const Stack = createStackNavigator<AuthStackParams>()
  const theme = useHekaTheme()
  const defaultStackOptions = useDefaultStackOptions(theme)

  return (
    <Stack.Navigator initialRouteName={Screens.Login} screenOptions={defaultStackOptions}>
      <Stack.Screen name={Screens.Login} component={Login} />
    </Stack.Navigator>
  )
}
