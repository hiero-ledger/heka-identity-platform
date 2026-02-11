import { TextInput } from '@heka-wallet/shared'
import { IGasConfig } from '@keplr-wallet/hooks'
import { observer } from 'mobx-react-lite'
import React from 'react'
import { View, ViewStyle } from 'react-native'

interface Props {
  containerStyle?: ViewStyle
  label: string
  gasConfig: IGasConfig
}

export const GasInput: React.FC<Props> = observer(({ containerStyle, label, gasConfig }) => {
  return (
    <View style={containerStyle}>
      <TextInput
        label={label}
        value={gasConfig.gasRaw}
        onChangeText={(text) => gasConfig.setGas(text)}
        keyboardType="number-pad"
      />
    </View>
  )
})
