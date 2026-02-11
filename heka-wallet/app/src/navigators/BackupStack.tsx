import { useHekaTheme } from '@heka-wallet/shared'
import { useDefaultStackOptions } from '@hyperledger/aries-bifold-core/App/navigators/defaultStackOptions'
import { createStackNavigator } from '@react-navigation/stack'
import React from 'react'
import { useTranslation } from 'react-i18next'

import { WalletRestore } from '../screens'

import { BackupStackParams, Screens } from './types'

export const BackupStack: React.FC = () => {
  const Stack = createStackNavigator<BackupStackParams>()
  const theme = useHekaTheme()
  const defaultStackOptions = useDefaultStackOptions(theme)

  const { t } = useTranslation()

  return (
    <Stack.Navigator initialRouteName={Screens.WalletRestore} screenOptions={defaultStackOptions}>
      <Stack.Screen
        name={Screens.WalletRestore}
        component={WalletRestore}
        options={{
          title: t('WalletBackup.WalletRestore'),
          // FIXME: Find better way to do this
          // Workaround to prevent header flickering when user is navigated away from auth modal
          headerShown: false,
        }}
      />
    </Stack.Navigator>
  )
}
