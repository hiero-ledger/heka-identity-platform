import { TextInput } from '@heka-wallet/shared'
import { IMemoConfig } from '@keplr-wallet/hooks'
import { observer } from 'mobx-react-lite'
import React from 'react'
import { View, ViewStyle } from 'react-native'

interface Props {
  containerStyle?: ViewStyle
  label: string
  memoConfig: IMemoConfig
}

export const MemoInput: React.FC<Props> = observer(({ containerStyle, label, memoConfig }) => {
  return (
    <View style={containerStyle}>
      <TextInput label={label} value={memoConfig.memo} onChangeText={(text) => memoConfig.setMemo(text)} />
    </View>
  )
})
