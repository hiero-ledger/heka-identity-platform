import { HekaTheme, useHekaTheme } from '@heka-wallet/shared'
import { Button, ButtonType } from '@hyperledger/aries-bifold-core'
import ButtonLoading from '@hyperledger/aries-bifold-core/App/components/animated/ButtonLoading'
import { useNavigation } from '@react-navigation/native'
import { StackNavigationProp, StackScreenProps } from '@react-navigation/stack'
import delay from 'delay'
import { observer } from 'mobx-react-lite'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Switch, Text, View } from 'react-native'

import WelcomeRocket from '../../../assets/welcome-rocket.svg'
import { useKeplrStore } from '../../KeplrStoreProvider'
import { KeplrStackParams, RegisterStackParams, Screens, Stacks } from '../../navigators/types'

const useStyles = (theme: HekaTheme) =>
  StyleSheet.create({
    completedTitle: {
      ...theme.TextTheme.headingFour,
      marginTop: theme.Spacing.xs,
    },
    completedText: {
      ...theme.TextTheme.labelTitle,
      alignItems: 'center',
      marginTop: theme.Spacing.md,
    },
    biometrySwitchContainer: {
      flexDirection: 'row',
      marginTop: theme.Spacing.xxxl,
      alignItems: 'center',
    },
  })

type RegisterEndScreenProps = StackScreenProps<RegisterStackParams, Screens.RegisterEnd>

export const RegisterEndScreen: React.FC<RegisterEndScreenProps> = observer(({ route }) => {
  const theme = useHekaTheme()
  const styles = useStyles(theme)

  const { t } = useTranslation()
  const { keychainStore, keyRingStore } = useKeplrStore()

  const navigation = useNavigation<StackNavigationProp<RegisterStackParams & KeplrStackParams>>()

  const password = route.params?.password

  const [isBiometricOn, setIsBiometricOn] = useState(false)

  useEffect(() => {
    if (password && keychainStore.isBiometrySupported) {
      setIsBiometricOn(true)
    }
  }, [keychainStore.isBiometrySupported, password])

  const [isLoading, setIsLoading] = useState(false)

  const toggleBiometry = () => {
    setIsBiometricOn((previousState) => !previousState)
  }

  const onDoneButtonPress = async () => {
    setIsLoading(true)
    try {
      // Because javascript is synchronous language, the loading state change would not be delivered to the UI thread
      // So to make sure that the loading state changes, just wait very short time.
      await delay(10)

      if (password && isBiometricOn) {
        await keychainStore.turnOnBiometry(password)
      }

      // Definitely, the last key is the newest keyring.
      if (keyRingStore.multiKeyStoreInfo.length > 0) {
        await keyRingStore.changeKeyRing(keyRingStore.multiKeyStoreInfo.length - 1)
      }

      navigation.reset({
        index: 0,
        routes: [{ name: Stacks.MainStack }],
      })
    } catch (e) {
      console.error(e)
    } finally {
      setIsLoading(false)
    }
  }

  const { ColorPallet, TextTheme, Spacing } = theme

  return (
    <View style={{ paddingHorizontal: Spacing.xxxl }}>
      <View style={{ flex: 8 }} />
      <View style={{ alignItems: 'center' }}>
        <WelcomeRocket width={400} height={360} />
        <Text style={styles.completedTitle}>{t('Crypto.Register.CompletedTitle')}</Text>
        <Text style={styles.completedText}>{t('Crypto.Register.CompletedText')}</Text>
      </View>
      {password && keychainStore.isBiometrySupported ? (
        <View style={styles.biometrySwitchContainer}>
          <Text style={TextTheme.labelTitle}>{t('Biometry.Enable')}</Text>
          <View style={{ flex: 1 }} />
          <Switch
            trackColor={{ false: ColorPallet.grayscale.lightGrey, true: ColorPallet.brand.primaryDisabled }}
            thumbColor={isBiometricOn ? ColorPallet.brand.primary : ColorPallet.grayscale.mediumGrey}
            ios_backgroundColor={ColorPallet.grayscale.lightGrey}
            value={isBiometricOn}
            onChange={toggleBiometry}
          />
        </View>
      ) : null}
      <View style={{ marginTop: Spacing.xxxl }}>
        <Button title="Done" buttonType={ButtonType.Primary} onPress={onDoneButtonPress} disabled={isLoading}>
          {isLoading && <ButtonLoading />}
        </Button>
      </View>
    </View>
  )
})
