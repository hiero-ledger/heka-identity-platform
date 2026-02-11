import { useGlobalStyles } from '@heka-wallet/shared'
import KeyboardView from '@hyperledger/aries-bifold-core/App/components/views/KeyboardView'
import { useRegisterConfig } from '@keplr-wallet/hooks'
import { useNavigation } from '@react-navigation/native'
import { StackNavigationProp } from '@react-navigation/stack'
import { observer } from 'mobx-react-lite'
import React from 'react'
import { View } from 'react-native'

import { useKeplrStore } from '../../KeplrStoreProvider'
import { useBIP44Option } from '../../common'
import { RegisterData, RegisterForm } from '../../components/views'
import { RegisterStackParams, Screens } from '../../navigators/types'

export const NewLedgerScreen: React.FC = observer(() => {
  const globalStyles = useGlobalStyles()

  const navigation = useNavigation<StackNavigationProp<RegisterStackParams>>()

  const { keyRingStore } = useKeplrStore()
  const registerConfig = useRegisterConfig(keyRingStore, [])

  const bip44Option = useBIP44Option(118)

  const onSubmit = async (formData: RegisterData) => {
    const { name, password } = formData
    await registerConfig.createLedger(name, password, bip44Option.bip44HDPath, 'Cosmos')

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
      <View style={globalStyles.defaultContainer}>
        <RegisterForm registerConfig={registerConfig} onSubmit={onSubmit} bip44Option={bip44Option} />
      </View>
    </KeyboardView>
  )
})
