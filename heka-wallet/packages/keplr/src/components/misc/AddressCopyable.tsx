import { HekaTheme, FontWeights, useHekaTheme, IconButton } from '@heka-wallet/shared'
import { Bech32Address } from '@keplr-wallet/cosmos'
import Clipboard from '@react-native-clipboard/clipboard'
import React from 'react'
import { StyleSheet, View, ViewStyle } from 'react-native'

import { useSimpleTimer } from '../../utils'

const COPY_SUCCESS_ICON_TIMEOUT_MS = 3000

const useStyles = (theme: HekaTheme) =>
  StyleSheet.create({
    container: {
      paddingLeft: theme.Spacing.md,
      paddingRight: theme.Spacing.xs,
      paddingVertical: theme.Spacing.xxxxs,
      borderRadius: theme.BorderRadius.medium,
      flexDirection: 'row',
      alignItems: 'center',
    },
    iconContainer: {
      marginLeft: theme.Spacing.xxxs,
    },
  })

interface Props {
  style?: ViewStyle
  address: string
  maxCharacters: number
}

export const AddressCopyable: React.FC<Props> = ({ style: propStyle, address, maxCharacters }) => {
  const theme = useHekaTheme()
  const styles = useStyles(theme)

  const { isTimedOut: showCopySuccess, setTimer: setCopySuccessTimer } = useSimpleTimer()

  const copyToClipboard = () => {
    Clipboard.setString(address)
    setCopySuccessTimer(COPY_SUCCESS_ICON_TIMEOUT_MS)
  }

  return (
    <View
      style={{
        ...styles.container,
        ...propStyle,
      }}
    >
      <IconButton
        iconName={showCopySuccess ? 'clipboard-check' : 'clipboard'}
        label={Bech32Address.shortenAddress(address, maxCharacters)}
        onPress={copyToClipboard}
        containerStyle={theme.Buttons.primary}
        textStyle={{ fontWeight: FontWeights.regular }}
        iconColor={theme.ColorPallet.grayscale.white}
      />
    </View>
  )
}
