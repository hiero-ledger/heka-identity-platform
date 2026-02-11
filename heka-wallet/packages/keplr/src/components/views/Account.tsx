import { HekaTheme, useHekaTheme, useGlobalStyles } from '@heka-wallet/shared'
import { Button, ButtonType } from '@hyperledger/aries-bifold-core'
import { Dec } from '@keplr-wallet/unit'
import { useNavigation } from '@react-navigation/native'
import { StackNavigationProp } from '@react-navigation/stack'
import { observer } from 'mobx-react-lite'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'

import { useKeplrStore } from '../../KeplrStoreProvider'
import { MainStackParams, Screens } from '../../navigators/types'
import { AddressCopyable } from '../misc'

const useStyles = (theme: HekaTheme) =>
  StyleSheet.create({
    accountNameContainer: {
      marginVertical: theme.Spacing.md,
      textAlign: 'center',
      ...theme.TextTheme.headingThree,
    },
    sectionContainer: {
      flex: 1,
      alignItems: 'center',
    },
    balanceContainer: {
      marginVertical: theme.Spacing.xxl * 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    balanceLoadingContainer: {
      position: 'absolute',
      top: 75,
    },
    bottomContainer: {
      width: '100%',
      marginVertical: theme.Spacing.xl,
    },
    bottomBalanceContainer: {
      alignItems: 'center',
      marginLeft: theme.Spacing.xs,
      marginBottom: theme.Spacing.md,
    },
  })

export const Account = observer(() => {
  const theme = useHekaTheme()
  const styles = useStyles(theme)
  const globalStyles = useGlobalStyles()

  const { t } = useTranslation()
  const { chainStore, accountStore, queriesStore } = useKeplrStore()

  const navigation = useNavigation<StackNavigationProp<MainStackParams>>()

  const account = accountStore.getAccount(chainStore.current.chainId)
  const queries = queriesStore.get(chainStore.current.chainId)

  const queryStakable = queries.queryBalances.getQueryBech32Address(account.bech32Address).stakable
  const stakable = queryStakable.balance

  const queryDelegated = queries.cosmos.queryDelegations.getQueryBech32Address(account.bech32Address)
  const delegated = queryDelegated.total

  const queryUnbonding = queries.cosmos.queryUnbondingDelegations.getQueryBech32Address(account.bech32Address)
  const unbonding = queryUnbonding.total

  const stakedSum = delegated.add(unbonding)

  const total = stakable.add(stakedSum)

  // TODO: Uncomment this after Mainnet launch
  // const totalPrice = priceStore.calculatePrice(total)

  const stakedBalance = stakedSum.shrink(true).trim(true).maxDecimals(6)
  const stakableBalance = total.shrink(true).trim(true).maxDecimals(6)

  // TODO: Uncomment this after Mainnet launch
  // const totalBalance = totalPrice ? totalPrice.toString() : stakableBalance.toString()
  const totalBalance = stakableBalance.toString()

  return (
    <View style={{ ...globalStyles.defaultContainer, ...globalStyles.card }}>
      <View style={styles.sectionContainer}>
        <Text style={styles.accountNameContainer}>{account.name ?? '...'}</Text>
        <AddressCopyable address={account.bech32Address} maxCharacters={22} />
        <View style={styles.balanceContainer}>
          <Text style={{ ...theme.TextTheme.title, marginBottom: theme.Spacing.xxxs }}>
            {t('Crypto.Home.TotalBalance')}
          </Text>
          <Text style={theme.TextTheme.labelTitle}>{totalBalance}</Text>
          {queryStakable.isFetching ? (
            <View style={styles.balanceLoadingContainer}>
              <ActivityIndicator size={theme.IconSizes.medium} color={theme.ColorPallet.brand.primary} />
            </View>
          ) : null}
        </View>
      </View>
      <View style={{ ...styles.sectionContainer, ...styles.bottomContainer, paddingTop: theme.Spacing.md }}>
        <View style={styles.bottomBalanceContainer}>
          <Text style={{ ...theme.TextTheme.label }}>{t('Common.Available')}</Text>
          <Text style={{ ...theme.TextTheme.title, marginBottom: theme.Spacing.xxxs }}>
            {stakableBalance.toString()}
          </Text>
        </View>
        <View style={styles.bottomBalanceContainer}>
          <Text style={{ ...theme.TextTheme.label }}>{t('Crypto.Staked')}</Text>
          <Text style={{ ...theme.TextTheme.title, marginBottom: theme.Spacing.xxxs }}>{stakedBalance.toString()}</Text>
        </View>
        <View style={globalStyles.defaultButtonContainer}>
          <Button
            title={t('Common.Send')}
            buttonType={ButtonType.Primary}
            disabled={stakable.toDec().lte(new Dec(0))}
            onPress={() =>
              navigation.navigate(Screens.Send, {
                currency: chainStore.current.stakeCurrency.coinMinimalDenom,
              })
            }
          />
        </View>
      </View>
    </View>
  )
})
