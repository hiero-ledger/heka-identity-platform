import { HekaTheme, useHekaTheme, BootstrapIcon } from '@heka-wallet/shared'
import { Button, ButtonType } from '@hyperledger/aries-bifold-core'
import { KeyRingStatus } from '@keplr-wallet/background'
import { Bech32Address } from '@keplr-wallet/cosmos'
import { Dec } from '@keplr-wallet/unit'
import { observer } from 'mobx-react-lite'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, StyleSheet, Text, View } from 'react-native'

import { useKeplrStore } from '../../KeplrStoreProvider'

const useStyles = (theme: HekaTheme) =>
  StyleSheet.create({
    selectablesContainer: {
      padding: theme.Spacing.xl,
      borderRadius: theme.BorderRadius.small,
      borderWidth: theme.BorderWidth.small,
      borderColor: theme.ColorPallet.grayscale.mediumGrey,
      marginBottom: theme.Spacing.xs,
    },
    separator: {
      height: 1,
      backgroundColor: theme.ColorPallet.grayscale.mediumGrey,
      marginVertical: theme.Spacing.md,
    },
    sectionContainer: {
      flexDirection: 'row',
      alignItems: 'center',
    },
  })

export const CoinTypeSelect: React.FC = observer(() => {
  const { chainStore, keyRingStore, queriesStore } = useKeplrStore()

  const queries = queriesStore.get(chainStore.current.chainId)

  const selectables = keyRingStore.getKeyStoreSelectables(chainStore.current.chainId)

  const needSelectBIP44 = keyRingStore.status === KeyRingStatus.UNLOCKED && selectables.needSelectCoinType

  const [isSelectorModalShow, setIsSelectorModalShow] = useState(false)

  const refreshBalances = useCallback(async () => {
    const queryBalancesWaiter = selectables.selectables
      .map((selectable) => {
        return queries.queryBalances.getQueryBech32Address(selectable.bech32Address).balances.map((bal) => {
          return bal.waitFreshResponse()
        })
      })
      // Flatten
      .reduce((pre, cur) => {
        return pre.concat(cur)
      }, [])

    // Wait to fetch the account.
    const queryAccountsWaiter = selectables.selectables
      .map((selectable) => {
        return queries.cosmos.queryAccount.getQueryBech32Address(selectable.bech32Address)
      })
      .map((account) => {
        return account.waitFreshResponse()
      })

    await Promise.all([...queryBalancesWaiter, ...queryAccountsWaiter])

    // Remember that `waitFreshResponse()` not throw an error even if query fails.
  }, [queries.cosmos.queryAccount, queries.queryBalances, selectables.selectables])

  useEffect(() => {
    if (!needSelectBIP44) return
    // Wait to fetch the balances of the accounts (response is saved to the stores).
    refreshBalances().then(() => {
      // Assume that the first one as the main account of paths.
      const others = selectables.selectables.slice(1)

      // Check that the others have some balances/
      const hasBalancesOrError = others.some((other) => {
        const balances = queries.queryBalances.getQueryBech32Address(other.bech32Address).balances
        for (const balance of balances) {
          if (balance.error) {
            console.log('Open bip44 selector modal due to failure of querying balance', balance.error)
            return true
          }

          if (balance.balance.toDec().gt(new Dec(0))) {
            return true
          }
        }

        return false
      })

      // Check that the account exist on chain.
      // With stargate implementation, querying account fails with 404 status if account not exists.
      // But, if account receives some native tokens, the account would be created, and it makes sense to be able to choose it.
      const hasAccountOrError = others.some((other) => {
        const account = queries.cosmos.queryAccount.getQueryBech32Address(other.bech32Address)
        if (!account.error?.message) return true

        if (
          // In this case, it means that the account not exist on chain, and handle it as 0 sequence.
          account.error.status === 404 &&
          account.error.message.includes(`account ${other.bech32Address} not found`)
        ) {
          return false
        }

        console.log('Open bip44 selector modal due to failure of querying account', account.error)
        return true
      })

      // If there is no other accounts that have the balances or have sent txs,
      // just select the first account without requesting the users to select the account they want.
      if (!hasBalancesOrError && !hasAccountOrError) {
        keyRingStore.setKeyStoreCoinType(chainStore.current.chainId, selectables.selectables[0].path.coinType)
      } else {
        setIsSelectorModalShow(true)
      }
    })
  }, [
    chainStore,
    keyRingStore,
    needSelectBIP44,
    queries.cosmos.queryAccount,
    queries.queryBalances,
    selectables.selectables,
    refreshBalances,
  ])

  if (!needSelectBIP44) return null
  return <CoinTypeSelectModal isOpen={isSelectorModalShow} />
})

interface BIP44SelectableModalProps {
  isOpen: boolean
  close?: () => void
}

const CoinTypeSelectModal: React.FC<BIP44SelectableModalProps> = observer(() => {
  const theme = useHekaTheme()
  const styles = useStyles(theme)

  const { t } = useTranslation()
  const { chainStore, keyRingStore, queriesStore } = useKeplrStore()

  const queries = queriesStore.get(chainStore.current.chainId)

  const selectables = keyRingStore.getKeyStoreSelectables(chainStore.current.chainId)

  const [selectedIndex, setSelectedIndex] = useState(-1)

  return (
    //title="Select your account"
    <Modal>
      {selectables.selectables.map((selectable, index) => {
        return (
          <View
            key={index}
            style={{ ...styles.selectablesContainer, backgroundColor: selectedIndex === index ? 'blue' : 'white' }}
          >
            <Button
              title={''}
              buttonType={ButtonType.Primary}
              key={selectable.bech32Address}
              onPress={() => setSelectedIndex(index)}
            >
              <View style={styles.sectionContainer}>
                <View style={{ marginRight: theme.Spacing.md }}>
                  <BootstrapIcon
                    name={'wallet'}
                    color={theme.ColorPallet.grayscale.black}
                    size={theme.IconSizes.large}
                  />
                </View>
                <View>
                  <Text style={{ marginBottom: theme.Spacing.xxxs }}>{`m/44'/${selectable.path.coinType}'`}</Text>
                  <Text>{Bech32Address.shortenAddress(selectable.bech32Address, 26)}</Text>
                </View>
              </View>
              <View style={styles.separator} />
              <View style={{ ...styles.sectionContainer, marginBottom: theme.Spacing.xxxs }}>
                <Text>{t('Crypto.Balance')}</Text>
                <View style={{ flex: 1 }} />
                <Text>
                  {queries.queryBalances
                    .getQueryBech32Address(selectable.bech32Address)
                    .stakable.balance.shrink(true)
                    .trim(true)
                    .maxDecimals(6)
                    .toString()}
                </Text>
              </View>
              <View style={styles.sectionContainer}>
                <Text>{t('Crypto.Home.BIP44.PreviousTxs')}</Text>
                <View style={{ flex: 1 }} />
                <Text>{queries.cosmos.queryAccount.getQueryBech32Address(selectable.bech32Address).sequence}</Text>
              </View>
            </Button>
          </View>
        )
      })}
      <View style={{ marginTop: theme.Spacing.xs }}>
        <Button
          title={t('Crypto.Home.BIP44.SelectAccount')}
          buttonType={ButtonType.Primary}
          disabled={selectedIndex < 0}
          onPress={() =>
            keyRingStore.setKeyStoreCoinType(
              chainStore.current.chainId,
              selectables.selectables[selectedIndex].path.coinType
            )
          }
        />
      </View>
    </Modal>
  )
})
