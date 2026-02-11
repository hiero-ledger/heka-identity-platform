import {
  useHekaTheme,
  useGlobalStyles,
  PinConfirmation,
  authenticateByBiometry,
  isBiometryCancelledError,
} from '@heka-wallet/shared'
import { Button, ButtonType, ToastType } from '@hyperledger/aries-bifold-core'
import ButtonLoading from '@hyperledger/aries-bifold-core/App/components/animated/ButtonLoading'
import KeyboardView from '@hyperledger/aries-bifold-core/App/components/views/KeyboardView'
import { DenomHelper } from '@keplr-wallet/common'
import { useGasSimulator, useSendTxConfig } from '@keplr-wallet/hooks'
import { useNavigation } from '@react-navigation/native'
import { StackNavigationProp, StackScreenProps } from '@react-navigation/stack'
import { observer } from 'mobx-react-lite'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import Toast from 'react-native-toast-message'

import { useKeplrStore } from '../KeplrStoreProvider'
import { AsyncKVStore } from '../common'
import { AddressInput, AmountInput, FeeButtons, MemoInput } from '../components/inputs'
import { MainStackParams, Screens } from '../navigators/types'

const getSendConfigError = (config: ReturnType<typeof useSendTxConfig>) => {
  return (
    config.recipientConfig.error ??
    config.amountConfig.error ??
    config.memoConfig.error ??
    config.gasConfig.error ??
    config.feeConfig.error
  )
}

type SendScreenProps = StackScreenProps<MainStackParams, Screens.Send>

export const Send: React.FC<SendScreenProps> = observer(({ route }) => {
  const theme = useHekaTheme()
  const globalStyles = useGlobalStyles()
  const { t } = useTranslation()

  const { chainStore, accountStore, queriesStore, signInteractionStore, keychainStore } = useKeplrStore()

  const [pinConfirmVisible, setPinConfirmVisible] = useState(false)

  // Workaround to auto approve transactions
  useEffect(() => {
    const waitingData = signInteractionStore.waitingData
    if (!waitingData) return
    signInteractionStore.approveAndWaitEnd(waitingData.data.signDocWrapper)
  }, [signInteractionStore, signInteractionStore.waitingData])

  const navigation = useNavigation<StackNavigationProp<MainStackParams>>()

  const params = route.params

  const chainId = params.chainId ?? chainStore.current.chainId

  const account = accountStore.getAccount(chainId)

  const sendConfigs = useSendTxConfig(chainStore, queriesStore, accountStore, chainId, account.bech32Address, {
    allowHexAddressOnEthermint: true,
    computeTerraClassicTax: true,
  })

  const sendCurrency = sendConfigs.amountConfig.sendCurrency
  const sendAmount = sendConfigs.amountConfig.amount

  const gasSimulatorKey = useMemo(() => {
    const denomHelper = new DenomHelper(sendCurrency.coinMinimalDenom)

    if (denomHelper.type === 'cw20') {
      // Probably, the gas can be different per cw20 according to how the contract implemented.
      return `${denomHelper.type}/${denomHelper.contractAddress}`
    }

    return denomHelper.type
  }, [sendCurrency])

  const gasSimulator = useGasSimulator(
    new AsyncKVStore('gas-simulator.main.send'),
    chainStore,
    chainId,
    sendConfigs.gasConfig,
    sendConfigs.feeConfig,
    gasSimulatorKey,
    () => {
      // DO NOT IGNORE: This callback is used in MobX reaction under the hood.
      // This means that we need to use MobX observables directly:
      // For example, use 'sendConfigs.amountConfig.amount' instead of 'sendAmount' shortcut.
      // Otherwise, this callback may be not triggered on time and cause issues with gas simulation.

      // Prefer not to use the gas config or fee config,
      // because gas simulator can change the gas config and fee config from the result of reaction,
      // and it can make repeated reaction.
      if (sendConfigs.amountConfig.error != null || sendConfigs.recipientConfig.error != null) {
        throw new Error('Not ready to simulate tx')
      }

      const denomHelper = new DenomHelper(sendConfigs.amountConfig.sendCurrency.coinMinimalDenom)

      // Simulation for secret20 is not supported
      if (denomHelper.type === 'secret20') {
        throw new Error('Simulating secret wasm not supported')
      }

      return account.makeSendTokenTx(
        sendConfigs.amountConfig.amount,
        sendConfigs.amountConfig.sendCurrency,
        sendConfigs.recipientConfig.recipient
      )
    }
  )

  useEffect(() => {
    // To simulate secretwasm, we need to include the signature in the tx.
    // With the current structure, this approach is not possible.
    if (sendCurrency && new DenomHelper(sendCurrency.coinMinimalDenom).type === 'secret20') {
      gasSimulator.forceDisable(new Error('Simulating secret20 is not supported'))
      sendConfigs.gasConfig.setGas(account.secret.msgOpts.send.secret20.gas)
    } else {
      gasSimulator.forceDisable(false)
      gasSimulator.setEnabled(true)
    }
  }, [account.secret.msgOpts.send.secret20.gas, gasSimulator, sendCurrency, sendConfigs.gasConfig])

  useEffect(() => {
    if (sendConfigs.feeConfig.chainInfo.features?.includes('terra-classic-fee')) {
      // When considering stability tax for terra classic.
      // Simulation itself doesn't consider the stability tax send.
      // Thus, it always returns fairly lower gas.
      // To adjust this, for terra classic, increase the default gas adjustment
      gasSimulator.setGasAdjustment(1.6)
    }
  }, [gasSimulator, sendConfigs.feeConfig.chainInfo])

  useEffect(() => {
    if (!params.currency) return

    const currency = sendConfigs.amountConfig.sendableCurrencies.find((cur) => cur.coinMinimalDenom === params.currency)

    if (currency) {
      sendConfigs.amountConfig.setSendCurrency(currency)
    }
  }, [params.currency, sendConfigs.amountConfig])

  useEffect(() => {
    if (params.recipient) {
      sendConfigs.recipientConfig.setRawRecipient(params.recipient)
    }
  }, [params.recipient, sendConfigs.recipientConfig])

  const sendTokens = useCallback(async () => {
    try {
      await account.sendToken(
        sendAmount,
        sendCurrency,
        sendConfigs.recipientConfig.recipient,
        sendConfigs.memoConfig.memo,
        sendConfigs.feeConfig.toStdFee(),
        {
          preferNoSetMemo: true,
        },
        {
          onBroadcasted: (_txHash) => {
            navigation.navigate(Screens.Home)
          },
        }
      )
    } catch (e) {
      console.error(e)
      Toast.show({
        type: ToastType.Error,
        text1: t('Error.Problem'),
        text2: (e as Error)?.message || t('Error.Unknown'),
        position: 'bottom',
      })
    }
  }, [
    t,
    account,
    sendAmount,
    sendCurrency,
    sendConfigs.recipientConfig.recipient,
    sendConfigs.memoConfig.memo,
    sendConfigs.feeConfig,
    navigation,
  ])

  const confirmWithBiometryAndSend = async () => {
    await authenticateByBiometry(t('Crypto.ConfirmTransaction'))
      .then(async () => {
        await sendTokens()
      })
      .catch((error) => {
        if (!isBiometryCancelledError(error.name)) {
          setPinConfirmVisible(true)
        }
      })
  }

  const onSend = async () => {
    if (!account.isReadyToSendMsgs || !txStateIsValid) return

    const useBiometricConfirm = keychainStore.isBiometryOn

    if (useBiometricConfirm) {
      await confirmWithBiometryAndSend()
    } else {
      setPinConfirmVisible(true)
    }
  }

  const onPinConfirmSuccess = useCallback(() => {
    sendTokens()
    setPinConfirmVisible(false)
  }, [sendTokens])

  if (pinConfirmVisible) {
    return (
      <PinConfirmation
        title={t('Crypto.ConfirmTransaction')}
        onSuccess={onPinConfirmSuccess}
        onClose={() => setPinConfirmVisible(false)}
      />
    )
  }

  const error = getSendConfigError(sendConfigs)
  const txStateIsValid = error == null
  const isLoading = account.isSendingMsg === 'send'

  return (
    <KeyboardView>
      <View style={{ ...globalStyles.defaultContainer, paddingBottom: theme.Spacing.md }}>
        <AddressInput
          label={t('Crypto.Send.Recipient')}
          recipientConfig={sendConfigs.recipientConfig}
          memoConfig={sendConfigs.memoConfig}
        />
        {/*<CurrencySelector label="Token" placeHolder="Select Token" amountConfig={sendConfigs.amountConfig} />*/}
        <AmountInput label={t('Crypto.Send.Amount')} amountConfig={sendConfigs.amountConfig} />
        <MemoInput label={t('Crypto.Send.Memo')} memoConfig={sendConfigs.memoConfig} />
        <FeeButtons
          label={t('Crypto.Send.Fee')}
          gasLabel={t('Crypto.Send.Gas')}
          feeConfig={sendConfigs.feeConfig}
          gasConfig={sendConfigs.gasConfig}
          gasSimulator={gasSimulator}
          disabled={isLoading}
        />
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Button
            title={t('Common.Send')}
            buttonType={ButtonType.Primary}
            disabled={isLoading || !account.isReadyToSendMsgs || !txStateIsValid}
            onPress={onSend}
          >
            {isLoading && <ButtonLoading />}
          </Button>
        </View>
      </View>
    </KeyboardView>
  )
})
