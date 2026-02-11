import { useHekaTheme } from '@heka-wallet/shared'
import { Screens as BifoldScreens } from '@hyperledger/aries-bifold-core'
import { useDefaultStackOptions } from '@hyperledger/aries-bifold-core/App/navigators/defaultStackOptions'
import { HomeStackParams } from '@hyperledger/aries-bifold-core/App/types/navigators'
import { createStackNavigator } from '@react-navigation/stack'
import React from 'react'

import { Home } from '../screens'

export const HomeStack: React.FC = () => {
  const theme = useHekaTheme()

  const Stack = createStackNavigator<HomeStackParams>()

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
