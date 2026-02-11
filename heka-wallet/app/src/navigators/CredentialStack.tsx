import { TOKENS, useServices, useTheme, Screens as BifoldScreens } from '@hyperledger/aries-bifold-core'
import { useDefaultStackOptions } from '@hyperledger/aries-bifold-core/App/navigators/defaultStackOptions'
import { CredentialStackParams } from '@hyperledger/aries-bifold-core/App/types/navigators'
import { createStackNavigator } from '@react-navigation/stack'
import React from 'react'
import { useTranslation } from 'react-i18next'

export const CredentialStack: React.FC = () => {
  const Stack = createStackNavigator<CredentialStackParams>()
  const theme = useTheme()
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
