import { createStackNavigator } from '@react-navigation/stack'
import { observer } from 'mobx-react-lite'
import React from 'react'

import { LoadingModal } from '../components/modals'
import { isExternalAuthEnabled, isWalletBackupEnabled } from '../config'
import { useRootStore } from '../contexts'
import { useDcApiRegistration } from '../hooks/useDcApiRegistration'
import { useBasicMessageInvitations } from '../utils/useBasicMessageInvitations'
import { useDeeplinks } from '../utils/useDeeplinks'

import { AuthStack } from './AuthStack'
import { BackupStack } from './BackupStack'
import { BifoldStack } from './BifoldStack'
import { OpenIdStack } from './OpenIdStack'
import { SettingsStack } from './SettingsStack'
import { RootStackParams, Stacks } from './types'

const Stack = createStackNavigator<RootStackParams>()

export const RootStack: React.FC = observer(() => {
  const rootStore = useRootStore()
  const { oauthStore } = rootStore

  useDeeplinks()

  useBasicMessageInvitations()

  useDcApiRegistration()

  if (rootStore.isLoading) return <LoadingModal />
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animationEnabled: false }}>
      {isExternalAuthEnabled && !oauthStore.isLoggedIn ? (
        <Stack.Screen name={Stacks.AuthStack} component={AuthStack} />
      ) : (
        <>
          <Stack.Screen name={Stacks.BifoldStack} component={BifoldStack} />
          <Stack.Screen name={Stacks.SettingsStack} component={SettingsStack} />
          <Stack.Screen name={Stacks.OpenIdStack} component={OpenIdStack} />
          {isWalletBackupEnabled && <Stack.Screen name={Stacks.BackupStack} component={BackupStack} />}
        </>
      )}
    </Stack.Navigator>
  )
})
