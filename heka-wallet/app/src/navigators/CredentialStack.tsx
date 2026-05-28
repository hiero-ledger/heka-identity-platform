import { TOKENS, useServices, Screens as BifoldScreens, useDefaultStackOptions } from '@bifold/core'
import { CredentialStackParams } from '@bifold/core/src/types/navigators'
import { useHekaTheme } from '@heka-wallet/shared'
import { createStackNavigator } from '@react-navigation/stack'
import React from 'react'
import { useTranslation } from 'react-i18next'

const Stack = createStackNavigator<CredentialStackParams>()

export const CredentialStack: React.FC = () => {
  const theme = useHekaTheme()
  const { t } = useTranslation()
  const defaultStackOptions = useDefaultStackOptions(theme)

  const [ListCredentials, CredentialDetails, CredentialListHeaderRight] = useServices([
    TOKENS.SCREEN_CREDENTIAL_LIST,
    TOKENS.SCREEN_CREDENTIAL_DETAILS,
    TOKENS.COMPONENT_CRED_LIST_HEADER_RIGHT,
  ])

  return (
    <Stack.Navigator screenOptions={{ ...defaultStackOptions }}>
      <Stack.Screen
        name={BifoldScreens.Credentials}
        component={ListCredentials}
        options={() => ({
          title: t('Screens.Credentials'),
          headerRight: () => <CredentialListHeaderRight />,
        })}
      />
      <Stack.Screen
        name={BifoldScreens.CredentialDetails}
        component={CredentialDetails}
        options={{ title: t('Screens.CredentialDetails') }}
      />
    </Stack.Navigator>
  )
}
