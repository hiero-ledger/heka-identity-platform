import { useGlobalStyles, ScreenInfoText } from '@heka-wallet/shared'
import KeyboardView from '@hyperledger/aries-bifold-core/App/components/views/KeyboardView'
import { useNavigation } from '@react-navigation/native'
import { StackNavigationProp, StackScreenProps } from '@react-navigation/stack'
import { observer } from 'mobx-react-lite'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { useBIP44Option, useNewMnemonicConfig } from '../../../common'
import { WordsCard } from '../../../components/misc'
import { RegisterData, RegisterForm } from '../../../components/views'
import { RegisterStackParams, Screens } from '../../../navigators/types'

type NewMnemonicScreenProps = StackScreenProps<RegisterStackParams, Screens.NewMnemonic>

export const NewMnemonicScreen: React.FC<NewMnemonicScreenProps> = observer(({ route }) => {
  const globalStyles = useGlobalStyles()

  const { t } = useTranslation()
  const navigation = useNavigation<StackNavigationProp<RegisterStackParams>>()

  const registerConfig = route.params.registerConfig
  const bip44Option = useBIP44Option()

  const newMnemonicConfig = useNewMnemonicConfig(registerConfig)

  const words = newMnemonicConfig.mnemonic.split(' ')

  const onSubmit = async (formData: RegisterData) => {
    const { name, password } = formData

    newMnemonicConfig.setName(name)
    newMnemonicConfig.setPassword(password)

    navigation.navigate(Screens.VerifyMnemonic, {
      registerConfig,
      newMnemonicConfig,
      bip44HDPath: bip44Option.bip44HDPath,
    })
  }

  return (
    <KeyboardView>
      <View style={globalStyles.defaultContainer}>
        <ScreenInfoText
          title={t('Crypto.Register.NewMnemonic.Title')}
          textLines={[t('Crypto.Register.NewMnemonic.InfoText1'), t('Crypto.Register.NewMnemonic.InfoText2')]}
        />
        <WordsCard
          wordSet={words.map((word) => ({
            value: word,
          }))}
          showCopyButton={true}
        />
        <RegisterForm registerConfig={registerConfig} onSubmit={onSubmit} bip44Option={bip44Option} />
      </View>
    </KeyboardView>
  )
})
