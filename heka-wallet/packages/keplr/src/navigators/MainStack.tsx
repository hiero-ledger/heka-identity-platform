import { useHekaTheme } from '@heka-wallet/shared'
import { ButtonLocation, HeaderButton, testIdWithKey } from '@hyperledger/aries-bifold-core'
import { useDefaultStackOptions } from '@hyperledger/aries-bifold-core/App/navigators/defaultStackOptions'
import { useNavigation } from '@react-navigation/native'
import { createStackNavigator, StackNavigationProp } from '@react-navigation/stack'
import React from 'react'
import { useTranslation } from 'react-i18next'

import { Home, SelectAccount, Send } from '../screens'

import { KeplrStackParams, MainStackParams, Screens, Stacks } from './types'

export const MainStack: React.FC = () => {
  const Stack = createStackNavigator<MainStackParams>()
  const theme = useHekaTheme()
  const defaultStackOptions = useDefaultStackOptions(theme)

  const { t } = useTranslation()

  const navigation = useNavigation<StackNavigationProp<KeplrStackParams & MainStackParams>>()

  return (
    <Stack.Navigator
      screenOptions={{
        ...defaultStackOptions,
        title: t('Crypto.Title'),
      }}
      initialRouteName={Screens.Home}
    >
      <Stack.Screen
        name={Screens.Home}
        component={Home}
        options={() => ({
          headerRight: () => (
            <HeaderButton
              buttonLocation={ButtonLocation.Right}
              onPress={() => navigation.navigate(Screens.SelectAccount)}
              icon={'account'}
              accessibilityLabel={'Select Account'}
              testID={testIdWithKey('SelectAccount')}
            />
          ),
        })}
      />
      <Stack.Screen
        name={Screens.SelectAccount}
        component={SelectAccount}
        options={() => ({
          title: t('Crypto.Account.SelectAccount'),
          headerRight: () => (
            <HeaderButton
              buttonLocation={ButtonLocation.Right}
              onPress={() => navigation.navigate(Stacks.RegisterStack)}
              icon={'plus'}
              accessibilityLabel={'Add Account'}
              testID={testIdWithKey('AddAccount')}
            />
          ),
        })}
      />
      <Stack.Screen name={Screens.Send} component={Send} />
    </Stack.Navigator>
  )
}
