import { useHekaTheme } from '@heka-wallet/shared'
import { useStore as useBifoldStore } from '@hyperledger/aries-bifold-core'
import HeaderButton, { ButtonLocation } from '@hyperledger/aries-bifold-core/App/components/buttons/HeaderButton'
import { useDefaultStackOptions } from '@hyperledger/aries-bifold-core/App/navigators/defaultStackOptions'
import {
  TabStacks as BifoldTabStacks,
  Stacks as BifoldStacks,
} from '@hyperledger/aries-bifold-core/App/types/navigators'
import { createStackNavigator, StackScreenProps } from '@react-navigation/stack'
import React, { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { OpenIdCredentialOffer, OpenIdPresentationRequest, PresentationCredentialChange } from '../screens'

import { OpenIdStackParams, RootStackParams, Screens, Stacks } from './types'

type Props = StackScreenProps<RootStackParams, Stacks.OpenIdStack>

export const OpenIdStack: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation()

  const Stack = createStackNavigator<OpenIdStackParams>()
  const theme = useHekaTheme()
  const defaultStackOptions = useDefaultStackOptions(theme)

  const [bifoldStore] = useBifoldStore()

  // Required to navigate user to Bifold unlock screen in case of wallet lockout
  useEffect(() => {
    if (!bifoldStore.authentication.didAuthenticate) {
      navigation.navigate(Stacks.BifoldStack)
    }
  }, [navigation, bifoldStore.authentication.didAuthenticate])

  const navigateToHome = () => {
    navigation.navigate(Stacks.BifoldStack, {
      screen: BifoldStacks.TabStack,
      params: { screen: BifoldTabStacks.HomeStack },
    })
  }

  return (
    <Stack.Navigator initialRouteName={Screens.OpenIdCredentialOffer} screenOptions={defaultStackOptions}>
      <Stack.Screen
        name={Screens.OpenIdCredentialOffer}
        component={OpenIdCredentialOffer}
        options={() => ({
          title: t('Screens.CredentialOffer'),
          headerLeft: () => (
            <HeaderButton
              buttonLocation={ButtonLocation.Left}
              testID={t('Global.Back')}
              accessibilityLabel={t('Global.Back')}
              onPress={navigateToHome}
              icon="arrow-left"
            />
          ),
        })}
      />
      <Stack.Screen
        name={Screens.OpenIdPresentationRequest}
        component={OpenIdPresentationRequest}
        options={() => ({
          title: t('Screens.ProofRequest'),
          headerLeft: () => (
            <HeaderButton
              buttonLocation={ButtonLocation.Left}
              testID={t('Global.Back')}
              accessibilityLabel={t('Global.Back')}
              onPress={navigateToHome}
              icon="arrow-left"
            />
          ),
        })}
      />
      <Stack.Screen
        name={Screens.PresentationCredentialChange}
        component={PresentationCredentialChange}
        options={() => ({
          title: t('Screens.ProofChangeCredential'),
        })}
      />
    </Stack.Navigator>
  )
}
