import { useHekaTheme, StepProgressHeader, useStepsProgressHeader, platformBackIconConfig } from '@heka-wallet/shared'
import { ButtonLocation, HeaderButton, testIdWithKey } from '@hyperledger/aries-bifold-core'
import { useDefaultStackOptions } from '@hyperledger/aries-bifold-core/App/navigators/defaultStackOptions'
import { useNavigation } from '@react-navigation/native'
import { createStackNavigator, StackNavigationProp } from '@react-navigation/stack'
import React from 'react'
import { useTranslation } from 'react-i18next'

import {
  NewMnemonicScreen,
  RecoverMnemonicScreen,
  RegisterEndScreen,
  RegisterIntroScreen,
  VerifyMnemonicScreen,
} from '../screens'
import { NewLedgerScreen } from '../screens/register/NewLedger'

import { KeplrStackParams, RegisterStackParams, Screens } from './types'

export const RegisterStack = () => {
  const Stack = createStackNavigator<RegisterStackParams>()
  const theme = useHekaTheme()
  const defaultStackOptions = useDefaultStackOptions(theme)

  const { t } = useTranslation()

  const navigation = useNavigation<StackNavigationProp<KeplrStackParams>>()

  const { progressState, setProgressState } = useStepsProgressHeader()

  return (
    <Stack.Navigator
      screenOptions={{
        ...defaultStackOptions,
        title: t('Crypto.Title'),
        headerTitle: () => <StepProgressHeader {...progressState} />,
      }}
      initialRouteName={Screens.RegisterIntro}
    >
      <Stack.Screen
        name={Screens.RegisterIntro}
        component={RegisterIntroScreen}
        options={() => ({
          headerLeft: () => (
            <HeaderButton
              buttonLocation={ButtonLocation.Left}
              onPress={navigation.goBack}
              icon={platformBackIconConfig.name}
              accessibilityLabel={'goBack'}
              testID={testIdWithKey('goBack')}
            />
          ),
          headerTitle: defaultStackOptions.headerTitle,
        })}
      />

      {/*TODO: We probably need a better way to track progress state between different registration flows.*/}
      {/*Good option is to use screen groups for that, but React Navigation does not support 'focus' listeners for 'Stack.Group' component.*/}
      {/*And another option seems to be to extract each registration flow as a separate nested stack.*/}

      <Stack.Screen
        name={Screens.NewMnemonic}
        component={NewMnemonicScreen}
        listeners={() => ({
          focus: () => setProgressState({ stepsCount: 3, currentStepIndex: 0 }),
        })}
      />
      <Stack.Screen
        name={Screens.VerifyMnemonic}
        component={VerifyMnemonicScreen}
        listeners={() => ({
          focus: () => setProgressState({ stepsCount: 3, currentStepIndex: 1 }),
        })}
      />
      <Stack.Screen
        name={Screens.RecoverMnemonic}
        component={RecoverMnemonicScreen}
        listeners={() => ({
          focus: () => setProgressState({ stepsCount: 2, currentStepIndex: 0 }),
        })}
      />
      <Stack.Screen
        name={Screens.NewLedger}
        component={NewLedgerScreen}
        listeners={() => ({
          focus: () => setProgressState({ stepsCount: 2, currentStepIndex: 0 }),
        })}
      />
      <Stack.Screen
        name={Screens.RegisterEnd}
        component={RegisterEndScreen}
        listeners={() => ({
          focus: () => setProgressState((state) => ({ ...state, currentStepIndex: state.stepsCount - 1 })),
        })}
      />
    </Stack.Navigator>
  )
}
