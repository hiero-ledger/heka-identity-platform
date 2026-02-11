import { useHekaTheme, useGlobalStyles, ScreenInfoText } from '@heka-wallet/shared'
import KeyboardView from '@hyperledger/aries-bifold-core/App/components/views/KeyboardView'
import { useNavigation } from '@react-navigation/native'
import { StackNavigationProp, StackScreenProps } from '@react-navigation/stack'
import { observer } from 'mobx-react-lite'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { useBIP44Option } from '../../../common'
import { RegisterData, RegisterForm } from '../../../components/views'
import { RegisterStackParams, Screens } from '../../../navigators/types'
import { getPrivateKey, isPrivateKey, trimWords } from '../../../utils/mnemonic'

type RecoverMnemonicScreenProps = StackScreenProps<RegisterStackParams, Screens.RecoverMnemonic>

export const RecoverMnemonicScreen: React.FC<RecoverMnemonicScreenProps> = observer(({ route }) => {
  const theme = useHekaTheme()
  const globalStyles = useGlobalStyles()

  const { t } = useTranslation()

  const navigation = useNavigation<StackNavigationProp<RegisterStackParams>>()

  const registerConfig = route.params.registerConfig
  const bip44Option = useBIP44Option()

  const onSubmit = async (formData: RegisterData) => {
    const { name, password, mnemonic: mnemonicStr } = formData

    const mnemonic = trimWords(mnemonicStr)

    if (!isPrivateKey(mnemonic)) {
      await registerConfig.createMnemonic(name, mnemonic, password, bip44Option.bip44HDPath)
    } else {
      const privateKey = getPrivateKey(mnemonic)
      await registerConfig.createPrivateKey(name, privateKey, password)
    }

    navigation.reset({
      index: 0,
      routes: [
        {
          name: Screens.RegisterEnd,
          params: {
            password,
          },
        },
      ],
    })
  }

  return (
    <KeyboardView>
      <View style={{ ...globalStyles.defaultContainer, height: '100%' }}>
        <ScreenInfoText
          title={t('Crypto.Register.ImportWallet.Title')}
          textLines={[t('Crypto.Register.ImportWallet.InfoText')]}
          containerStyle={{ marginBottom: theme.Spacing.md }}
        />
        <RegisterForm
          registerConfig={registerConfig}
          onSubmit={onSubmit}
          bip44Option={bip44Option}
          showMnemonicField={true}
        />
      </View>
    </KeyboardView>
  )
})
