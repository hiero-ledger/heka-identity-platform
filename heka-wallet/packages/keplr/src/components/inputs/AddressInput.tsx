import { TextInput, countSubstring } from '@heka-wallet/shared'
import {
  EmptyAddressError,
  ICNSFailedToFetchError,
  ICNSIsFetchingError,
  IMemoConfig,
  InvalidBech32Error,
  IRecipientConfig,
  IRecipientConfigWithICNS,
} from '@keplr-wallet/hooks'
import { observer } from 'mobx-react-lite'
import React, { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { View, ViewStyle } from 'react-native'

const useErrorText = (error: Error | undefined): string | undefined => {
  const { t } = useTranslation()
  return useMemo(() => {
    if (!error) return
    switch (error.constructor.name) {
      case EmptyAddressError.name:
        // No need to show the error to user.
        return
      case InvalidBech32Error.name:
        return t('Crypto.Error.InvalidBech32Error')
      case ICNSFailedToFetchError.name:
        return t('Crypto.Error.ICNSFailedToFetchError')
      case ICNSIsFetchingError.name:
        return
      default:
        return t('Error.Unknown')
    }
  }, [t, error])
}

interface Props {
  containerStyle?: ViewStyle
  label: string
  recipientConfig: IRecipientConfig | IRecipientConfigWithICNS
  memoConfig: IMemoConfig
}

export const AddressInput: React.FC<Props> = observer(({ containerStyle, label, recipientConfig }) => {
  const errorText = useErrorText(recipientConfig.error)

  const shouldFillBench32Prefix = (input: string) => {
    return (
      input &&
      input[input.length - 1] === '.' &&
      countSubstring(input, '.') === 1 &&
      countSubstring(recipientConfig.rawRecipient, '.') === 0
    )
  }

  const isICNSName = 'isICNSName' in recipientConfig && recipientConfig.isICNSName

  const onChangeText = (value: string) => {
    if (
      // If icns is possible and users enters ".", complete bech32 prefix automatically.
      isICNSName &&
      shouldFillBench32Prefix(value)
    ) {
      value = value + recipientConfig.icnsExpectedBech32Prefix
    }
    recipientConfig.setRawRecipient(value)
  }

  return (
    <View style={containerStyle}>
      <TextInput
        label={label}
        error={errorText}
        value={recipientConfig.rawRecipient}
        onChangeText={onChangeText}
        autoCorrect={false}
        autoCapitalize="none"
      />
    </View>
  )
})
