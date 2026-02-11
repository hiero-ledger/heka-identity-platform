import { HekaTheme, useHekaTheme, useGlobalStyles } from '@heka-wallet/shared'
import { Button, ButtonType } from '@hyperledger/aries-bifold-core'
import { useRegisterConfig } from '@keplr-wallet/hooks'
import { useNavigation } from '@react-navigation/native'
import { StackNavigationProp } from '@react-navigation/stack'
import { observer } from 'mobx-react-lite'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { useKeplrStore } from '../../KeplrStoreProvider'
import { KeplrLogo } from '../../components/misc'
import { RegisterStackParams, Screens } from '../../navigators/types'

const useStyles = (theme: HekaTheme) =>
  StyleSheet.create({
    registerOptionButton: {
      marginBottom: theme.Spacing.xs,
    },
  })

export const RegisterIntroScreen: React.FC = observer(() => {
  const theme = useHekaTheme()
  const styles = useStyles(theme)
  const globalStyles = useGlobalStyles()

  const { t } = useTranslation()

  const navigation = useNavigation<StackNavigationProp<RegisterStackParams>>()

  const { keyRingStore } = useKeplrStore()
  const registerConfig = useRegisterConfig(keyRingStore, [])

  return (
    <View
      style={{
        ...globalStyles.defaultContainer,
        ...globalStyles.adaptivePadding,
      }}
    >
      <KeplrLogo />
      <View style={{ marginBottom: theme.Spacing.md }}>
        <View style={styles.registerOptionButton}>
          <Button
            title={t('Crypto.Register.NewWallet')}
            buttonType={ButtonType.Primary}
            onPress={() => navigation.navigate(Screens.NewMnemonic, { registerConfig })}
          />
        </View>
        <View style={styles.registerOptionButton}>
          <Button
            title={t('Crypto.Register.ImportExisting')}
            buttonType={ButtonType.Secondary}
            onPress={() => navigation.navigate(Screens.RecoverMnemonic, { registerConfig })}
          />
        </View>
        {/*<View style={styles.registerOptionButton}>*/}
        {/*  <Button*/}
        {/*    title={t('Crypto.Register.ImportLedgerNano')}*/}
        {/*    buttonType={ButtonType.Secondary}*/}
        {/*    onPress={() => navigation.navigate(Screens.NewLedger)}*/}
        {/*    disabled*/}
        {/*  />*/}
        {/*</View>*/}
      </View>
    </View>
  )
})
