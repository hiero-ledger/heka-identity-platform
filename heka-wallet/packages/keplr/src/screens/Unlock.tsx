import { useHekaTheme, useGlobalStyles, TextInput } from '@heka-wallet/shared'
import { Button, ButtonType } from '@hyperledger/aries-bifold-core'
import ButtonLoading from '@hyperledger/aries-bifold-core/App/components/animated/ButtonLoading'
import KeyboardView from '@hyperledger/aries-bifold-core/App/components/views/KeyboardView'
import { KeyRingStatus } from '@keplr-wallet/background'
import { IAccountStore } from '@keplr-wallet/stores'
import { StackActions, useNavigation } from '@react-navigation/native'
import { StackNavigationProp } from '@react-navigation/stack'
import delay from 'delay'
import { autorun } from 'mobx'
import { observer } from 'mobx-react-lite'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { useKeplrStore } from '../KeplrStoreProvider'
import { KeplrLogo } from '../components/misc'
import { KeplrStackParams, Screens, Stacks } from '../navigators/types'

async function waitAccountLoad(accountStore: IAccountStore, chainId: string): Promise<void> {
  if (accountStore.getAccount(chainId).bech32Address) return
  return new Promise((resolve) => {
    const disposer = autorun(() => {
      if (accountStore.getAccount(chainId).bech32Address) {
        resolve()
        disposer && disposer()
      }
    })
  })
}

export const Unlock: React.FC = observer(() => {
  const theme = useHekaTheme()
  const globalStyles = useGlobalStyles()

  const { t } = useTranslation()
  const { keyRingStore, keychainStore, accountStore, chainStore } = useKeplrStore()

  const navigation = useNavigation<StackNavigationProp<KeplrStackParams>>()

  const navigateToHomeOnce = useRef(false)
  const routeToRegisterOnce = useRef(false)
  const autoTryBiometryOnce = useRef(false)

  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isBiometricLoading, setIsBiometricLoading] = useState(false)
  const [isFailed, setIsFailed] = useState(false)

  useEffect(() => {
    // If the keyring is empty,
    // route to the register screen.
    if (!routeToRegisterOnce.current && keyRingStore.status === KeyRingStatus.EMPTY) {
      routeToRegisterOnce.current = true
      navigation.dispatch(
        StackActions.replace(Stacks.RegisterStack, {
          screen: Screens.RegisterIntro,
        })
      )
    }
  }, [keyRingStore.status, navigation])

  const navigateToHome = useCallback(async () => {
    if (!navigateToHomeOnce.current) {
      // Wait the account of selected chain is loaded.
      await waitAccountLoad(accountStore, chainStore.current.chainId)
      navigation.dispatch(StackActions.replace('Home'))
    }
    navigateToHomeOnce.current = true
  }, [accountStore, chainStore, navigation])

  useEffect(() => {
    if (keyRingStore.status === KeyRingStatus.UNLOCKED) {
      navigateToHome()
    }
  }, [keyRingStore.status, navigateToHome])

  const tryUnlockWithBiometry = useCallback(async () => {
    try {
      setIsBiometricLoading(true)

      // TODO: Find a way to remove this
      // Ugly workaround to allow React state to be updated before next 'await' call completion
      await delay(10)

      await keychainStore.tryUnlockWithBiometry()
    } catch (e) {
      console.error(e)
      setIsBiometricLoading(false)
    }
  }, [keychainStore])

  useEffect(() => {
    const autoBiometryNeeded = keychainStore.isBiometryOn && keyRingStore.status === KeyRingStatus.LOCKED
    if (!autoBiometryNeeded || autoTryBiometryOnce.current) return

    autoTryBiometryOnce.current = true
    tryUnlockWithBiometry()
  }, [keychainStore.isBiometryOn, keyRingStore.status, tryUnlockWithBiometry])

  const tryUnlockWithPassword = async () => {
    try {
      setIsLoading(true)

      // TODO: Find a way to remove this
      // Ugly workaround to allow React state to be updated before next 'await' call completion
      await delay(10)

      await keyRingStore.unlock(password)
    } catch (e) {
      console.error(e)
      setIsLoading(false)
      setIsFailed(true)
    }
  }

  return (
    <KeyboardView>
      <View style={{ ...globalStyles.defaultContainer, ...globalStyles.adaptivePadding }}>
        <KeplrLogo />
        <View style={{ flex: 1, paddingTop: 10 }}>
          <TextInput
            label={t('Crypto.Register.Form.Password.Label')}
            returnKeyType="done"
            secureTextEntry={true}
            value={password}
            error={isFailed ? t('Crypto.Register.Form.Password.Invalid') : undefined}
            onChangeText={setPassword}
            onSubmitEditing={tryUnlockWithPassword}
          />
          <View style={{ marginTop: theme.Spacing.xxxl }}>
            <Button
              title={t('Crypto.Unlock.SignIn')}
              buttonType={ButtonType.Primary}
              onPress={tryUnlockWithPassword}
              disabled={isLoading}
            >
              {isLoading && <ButtonLoading />}
            </Button>
            {keychainStore.isBiometryOn ? (
              <View style={{ marginTop: theme.Spacing.md }}>
                <Button
                  title={t('Crypto.Unlock.UseBiometry')}
                  buttonType={ButtonType.Primary}
                  onPress={tryUnlockWithBiometry}
                  disabled={isBiometricLoading}
                >
                  {isBiometricLoading && <ButtonLoading />}
                </Button>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </KeyboardView>
  )
})
