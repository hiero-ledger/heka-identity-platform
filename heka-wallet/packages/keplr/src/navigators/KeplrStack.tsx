import { useHekaTheme } from '@heka-wallet/shared'
import { useStore as useBifoldStore } from '@hyperledger/aries-bifold-core'
import { useDefaultStackOptions } from '@hyperledger/aries-bifold-core/App/navigators/defaultStackOptions'
import { KeyRingStatus } from '@keplr-wallet/background'
import { useNavigation } from '@react-navigation/native'
import { createStackNavigator, StackNavigationProp } from '@react-navigation/stack'
import { observer } from 'mobx-react-lite'
import React, { useEffect } from 'react'

import { useKeplrStore } from '../KeplrStoreProvider'

import { AuthStack } from './AuthStack'
import { MainStack } from './MainStack'
import { RegisterStack } from './RegisterStack'
import { KeplrStackParams, Stacks } from './types'

export const KeplrStack = observer(() => {
  const Stack = createStackNavigator<KeplrStackParams>()
  const theme = useHekaTheme()
  const defaultStackOptions = useDefaultStackOptions(theme)

  const navigation = useNavigation<StackNavigationProp<KeplrStackParams>>()

  const [bifoldStore] = useBifoldStore()
  const { keyRingStore } = useKeplrStore()

  // Required to navigate user to Bifold unlock screen in case of wallet lockout
  // Should be there until we merge SSI and Crypto wallets auth
  useEffect(() => {
    if (!bifoldStore.authentication.didAuthenticate) {
      keyRingStore.lock()
      navigation.goBack()
    }
  }, [navigation, keyRingStore, bifoldStore.authentication.didAuthenticate])

  return (
    <Stack.Navigator
      initialRouteName={keyRingStore.status !== KeyRingStatus.UNLOCKED ? Stacks.AuthStack : Stacks.MainStack}
      screenOptions={{ ...defaultStackOptions, headerShown: false }}
    >
      <Stack.Screen name={Stacks.RegisterStack} component={RegisterStack} />
      <Stack.Screen name={Stacks.AuthStack} component={AuthStack} />
      <Stack.Screen name={Stacks.MainStack} component={MainStack} />
    </Stack.Navigator>
  )
})
