import { useDefaultStackOptions } from '@bifold/core'
import { useHekaTheme } from '@heka-wallet/shared'
import { KeyRingStatus } from '@keplr-wallet/background'
import { useNavigation } from '@react-navigation/native'
import { createStackNavigator, StackNavigationProp } from '@react-navigation/stack'
import { observer } from 'mobx-react-lite'
import React, { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { useKeplrStore } from '../KeplrStoreProvider'
import { Unlock } from '../screens'

import { AuthStackParams, KeplrStackParams, Screens, Stacks } from './types'

const Stack = createStackNavigator<AuthStackParams>()

export const AuthStack: React.FC = observer(() => {
  const theme = useHekaTheme()
  const defaultStackOptions = useDefaultStackOptions(theme)

  const { t } = useTranslation()

  const navigation = useNavigation<StackNavigationProp<KeplrStackParams>>()

  const { keyRingStore } = useKeplrStore()

  useEffect(() => {
    if (keyRingStore.status === KeyRingStatus.UNLOCKED) {
      navigation.reset({
        index: 0,
        routes: [{ name: Stacks.MainStack }],
      })
    }
  }, [navigation, keyRingStore.status])

  return (
    <Stack.Navigator
      screenOptions={{
        ...defaultStackOptions,
        title: t('Crypto.Title'),
      }}
      initialRouteName={Screens.Unlock}
    >
      <Stack.Screen name={Screens.Unlock} component={Unlock} />
    </Stack.Navigator>
  )
})
