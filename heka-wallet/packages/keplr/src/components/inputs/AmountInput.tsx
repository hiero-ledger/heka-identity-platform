import { TextInput } from '@heka-wallet/shared'
import {
  EmptyAmountError,
  IAmountConfig,
  InsufficientAmountError,
  InvalidNumberAmountError,
  NegativeAmountError,
  ZeroAmountError,
} from '@keplr-wallet/hooks'
import { observer } from 'mobx-react-lite'
import React, { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform, View, ViewStyle } from 'react-native'
import * as RNLocalize from 'react-native-localize'

const useErrorText = (error: Error | undefined): string | undefined => {
  const { t } = useTranslation()
  return useMemo(() => {
    if (!error) return
    switch (error.constructor.name) {
      case EmptyAmountError.name:
        // No need to show the error to user.
        return
      case InvalidNumberAmountError.name:
        return t('Crypto.Error.InvalidNumberAmountError')
      case ZeroAmountError.name:
        return t('Crypto.Error.ZeroAmountError')
      case NegativeAmountError.name:
        return t('Crypto.Error.NegativeAmountError')
      case InsufficientAmountError.name:
        return t('Crypto.Error.InsufficientAmountError')
      default:
        return t('Error.Unknown')
    }
  }, [t, error])
}

interface Props {
  containerStyle?: ViewStyle
  label: string
  amountConfig: IAmountConfig
}

export const AmountInput: React.FC<Props> = observer(({ containerStyle, label, amountConfig }) => {
  const errorText: string | undefined = useErrorText(amountConfig.error)

  // In IOS, the numeric type keyboard has a decimal separator "." or "," depending on the language and region of the user device.
  // However, asset input in keplr unconditionally follows the US standard, so it must be ".".
  // However, if only "," appears on the keyboard, "." cannot be entered.
  // In this case, it is inevitable to use a different type of keyboard.
  const keyBoardType =
    Platform.OS === 'ios' && RNLocalize.getNumberFormatSettings().decimalSeparator !== '.'
      ? 'numbers-and-punctuation'
      : 'numeric'

  return (
    <View style={containerStyle}>
      <TextInput
        label={label}
        value={amountConfig.amount}
        onChangeText={(text) => amountConfig.setAmount(text)}
        error={errorText}
        keyboardType={keyBoardType}
      />
    </View>
  )
})
