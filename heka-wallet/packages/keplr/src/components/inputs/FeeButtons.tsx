import { HekaTheme, useHekaTheme, useGlobalStyles } from '@heka-wallet/shared'
import { Button, ButtonType } from '@hyperledger/aries-bifold-core'
import { IFeeConfig, IGasConfig, IGasSimulator, InsufficientFeeError, NotLoadedFeeError } from '@keplr-wallet/hooks'
import { CoinPretty, PricePretty } from '@keplr-wallet/unit'
import { observer } from 'mobx-react-lite'
import React, { FunctionComponent, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet, Text, TextStyle, View, ViewProps } from 'react-native'

import { useKeplrStore } from '../../KeplrStoreProvider'

import { GasInput } from './GasInput'

const useStyles = (theme: HekaTheme) =>
  StyleSheet.create({
    container: {
      marginVertical: theme.Spacing.md,
    },
    buttonBorder: {
      borderWidth: theme.BorderWidth.small / 2,
      borderColor: theme.ColorPallet.grayscale.lightGrey,
      backgroundColor: theme.ColorPallet.grayscale.lightGrey,
    },
    buttonsContainer: {
      flexDirection: 'row',
      justifyContent: 'space-evenly',
      borderWidth: theme.BorderWidth.small / 2,
      borderRadius: theme.BorderRadius.smaller,
      borderColor: theme.ColorPallet.grayscale.lightGrey,
      overflow: 'hidden',
      backgroundColor: theme.ColorPallet.grayscale.darkGrey,
    },
    singleButtonContainer: {
      flex: 1,
      justifyContent: 'space-evenly',
    },
    loadingContainer: {
      height: theme.Spacing.md,
      marginTop: theme.Spacing.md,
      marginLeft: theme.Spacing.xxxs,
      justifyContent: 'center',
    },
    errorText: {
      ...theme.TextTheme.caption,
      marginTop: theme.Spacing.xxxxs,
      marginLeft: theme.Spacing.xxxs,
      color: theme.ColorPallet.semantic.error,
    },
  })

const useFeeErrorText = (error: Error | undefined): string | undefined => {
  const { t } = useTranslation()
  if (!error) return
  switch (error.constructor.name) {
    case InsufficientFeeError.name:
      return t('Crypto.Error.InsufficientFeeError')
    case NotLoadedFeeError.name:
      return undefined
    default:
      return error.message || t('Error.Unknown')
  }
}

const isFeeLoading = (feeConfig: IFeeConfig) => {
  return feeConfig.error?.constructor?.name === NotLoadedFeeError.name
}

export interface FeeButtonsProps {
  labelStyle?: TextStyle
  containerStyle?: ViewProps
  buttonsContainerStyle?: ViewProps
  errorLabelStyle?: TextStyle
  disabled?: boolean
  label: string
  gasLabel: string
  feeConfig: IFeeConfig
  gasConfig: IGasConfig
  gasSimulator: IGasSimulator
}

export const FeeButtons: FunctionComponent<FeeButtonsProps> = observer((props) => {
  const theme = useHekaTheme()
  const styles = useStyles(theme)
  return (
    <View style={styles.container}>
      {props.feeConfig.feeCurrency ? (
        <FeeButtonsInner {...props} />
      ) : (
        <GasInput label={props.gasLabel} gasConfig={props.gasConfig} />
      )}
    </View>
  )
})

export const FeeButtonsInner: React.FC<FeeButtonsProps> = observer(
  ({
    labelStyle,
    containerStyle,
    buttonsContainerStyle,
    errorLabelStyle,
    label,
    disabled,
    feeConfig,
    gasSimulator,
  }) => {
    const theme = useHekaTheme()
    const styles = useStyles(theme)
    const globalStyles = useGlobalStyles()

    const { t } = useTranslation()

    const { priceStore } = useKeplrStore()

    useEffect(() => {
      if (feeConfig.feeCurrency && !feeConfig.fee) {
        feeConfig.setFeeType('average')
      }
    }, [feeConfig])

    const errorText = useFeeErrorText(feeConfig.error)

    // For chains without feeCurrencies, Keplr assumes tx doesn’t need to include information about the fee and the fee button does not have to be rendered.
    // The architecture is designed so that fee button is not rendered if the parental component doesn’t have a feeCurrency.
    // However, because there may be situations where the fee buttons is rendered before the chain information is changed,
    // and the fee button is an observer, and the sequence of rendering the observer may not appear stabilized,
    // so only handling the rendering in the parent component may not be sufficient
    // Therefore, this line double checks to ensure that the fee buttons is not rendered if fee currency doesn’t exist.
    // But because this component uses hooks, using a hook in the line below can cause an error.
    // Note that hooks should be used above this line, and only rendering-related logic should exist below this line.
    if (!feeConfig.feeCurrency) {
      return <React.Fragment />
    }

    const lowFee = feeConfig.getFeeTypePretty('low')
    const lowFeePrice = priceStore.calculatePrice(lowFee)

    const averageFee = feeConfig.getFeeTypePretty('average')
    const averageFeePrice = priceStore.calculatePrice(averageFee)

    const highFee = feeConfig.getFeeTypePretty('high')
    const highFeePrice = priceStore.calculatePrice(highFee)

    const isLoading = isFeeLoading(feeConfig) || gasSimulator.isSimulating

    return (
      <View style={{ paddingBottom: theme.Spacing.xl, ...containerStyle }}>
        <Text style={{ ...theme.Inputs.label, marginBottom: theme.Spacing.xxxs, ...labelStyle }}>{label}</Text>
        <View style={{ ...styles.buttonsContainer, ...buttonsContainerStyle }}>
          <FeeButton
            label={t('Common.Low')}
            price={lowFeePrice}
            amount={lowFee}
            selected={feeConfig.feeType === 'low'}
            onPress={() => feeConfig.setFeeType('low')}
            disabled={disabled}
          />
          <View style={styles.buttonBorder} />
          <FeeButton
            label={t('Common.Average')}
            price={averageFeePrice}
            amount={averageFee}
            selected={feeConfig.feeType === 'average'}
            onPress={() => feeConfig.setFeeType('average')}
            disabled={disabled}
          />
          <View style={styles.buttonBorder} />
          <FeeButton
            label={t('Common.High')}
            price={highFeePrice}
            amount={highFee}
            selected={feeConfig.feeType === 'high'}
            onPress={() => feeConfig.setFeeType('high')}
            disabled={disabled}
          />
        </View>
        {isLoading ? (
          <View>
            <View style={styles.loadingContainer}>
              <ActivityIndicator size={theme.IconSizes.extraSmall} color={theme.ColorPallet.grayscale.white} />
            </View>
          </View>
        ) : null}
        {!isLoading && errorText ? (
          <View>
            <Text style={{ ...styles.errorText, ...globalStyles.absolute, ...errorLabelStyle }}>{errorText}</Text>
          </View>
        ) : null}
      </View>
    )
  }
)

interface FeeButtonProps {
  label: string
  price: PricePretty | undefined
  amount: CoinPretty
  selected: boolean
  onPress: () => void
  disabled?: boolean
}

const FeeButton: React.FC<FeeButtonProps> = ({ label, amount, selected, onPress, disabled }) => {
  const theme = useHekaTheme()
  const styles = useStyles(theme)

  const feeAmount = amount.maxDecimals(6).trim(true).separator('').toString()

  return (
    <View
      style={{
        ...styles.singleButtonContainer,
        backgroundColor: selected ? theme.ColorPallet.grayscale.mediumGrey : theme.ColorPallet.grayscale.darkGrey,
      }}
    >
      <Button
        title={''}
        buttonType={selected ? ButtonType.Secondary : ButtonType.Primary}
        onPress={onPress}
        disabled={disabled}
      >
        <View style={{ alignItems: 'center' }}>
          <Text style={{ ...theme.TextTheme.label, color: theme.ColorPallet.grayscale.white }}>{label}</Text>
          {/* TODO: Uncomment this after Mainnet launch */}
          {/*{price ? (*/}
          {/*  <Text*/}
          {/*    style={{*/}
          {/*      ...theme.TextTheme.labelSubtitle,*/}
          {/*      color: theme.ColorPallet.grayscale.white,*/}
          {/*    }}*/}
          {/*  >*/}
          {/*    {price.toString()}*/}
          {/*  </Text>*/}
          {/*) : null}*/}
          <Text
            numberOfLines={1}
            style={{
              ...theme.TextTheme.labelText,
              color: theme.ColorPallet.grayscale.white,
            }}
          >
            {feeAmount}
          </Text>
        </View>
      </Button>
    </View>
  )
}
