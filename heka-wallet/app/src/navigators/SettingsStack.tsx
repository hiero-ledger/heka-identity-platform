import { useHekaTheme } from '@heka-wallet/shared'
import { ButtonLocation, HeaderButton, ToastType } from '@hyperledger/aries-bifold-core'
import { useDefaultStackOptions } from '@hyperledger/aries-bifold-core/App/navigators/defaultStackOptions'
import { createStackNavigator } from '@react-navigation/stack'
import React from 'react'
import { useTranslation } from 'react-i18next'
import Toast from 'react-native-toast-message'

import { isExternalAuthEnabled } from '../config'
import { useRootStore } from '../contexts'
import { UserProfile } from '../screens'
import { useWalletAuthHelpers } from '../utils/useWalletAuthHelpers'

import { Screens, SettingsStackParams } from './types'

export const SettingsStack: React.FC = () => {
  const Stack = createStackNavigator<SettingsStackParams>()
  const theme = useHekaTheme()
  const defaultStackOptions = useDefaultStackOptions(theme)

  const { t } = useTranslation()

  const { lockWallet } = useWalletAuthHelpers()
  const { oauthStore } = useRootStore()

  const onLogOut = async () => {
    try {
      await oauthStore.logOut()
      await lockWallet()
    } catch (error) {
      Toast.show({
        type: ToastType.Error,
        text1: t('Error.Problem'),
        text2: (error as Error)?.message || t('Error.Unknown'),
      })
    }
  }

  return (
    <Stack.Navigator initialRouteName={Screens.UserProfile} screenOptions={defaultStackOptions}>
      {isExternalAuthEnabled && (
        <Stack.Screen
          name={Screens.UserProfile}
          component={UserProfile}
          options={{
            title: t('Settings.UserProfile'),
            headerRight: () => (
              <HeaderButton
                buttonLocation={ButtonLocation.Right}
                onPress={onLogOut}
                icon={'logout'}
                testID={'Log Out'}
                accessibilityLabel={'Log Out'}
              />
            ),
          }}
        />
      )}
    </Stack.Navigator>
  )
}
