import { usePrevious } from '@heka-wallet/shared'
import { useFocusEffect } from '@react-navigation/native'
import { observer } from 'mobx-react-lite'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, AppStateStatus, RefreshControl, ScrollView } from 'react-native'

import { useKeplrStore } from '../KeplrStoreProvider'
import { CoinTypeSelect } from '../components/modals'
import { Account } from '../components/views'

export const Home: React.FC = observer(() => {
  const { chainStore, accountStore, queriesStore, priceStore } = useKeplrStore()

  const [refreshing, setRefreshing] = useState(false)

  const scrollViewRef = useRef<ScrollView>(null)

  const currentChain = chainStore.current
  const currentChainId = currentChain.chainId
  const previousChainId = usePrevious(currentChainId)
  const chainStoreIsInitializing = chainStore.isInitializing
  const previousChainStoreIsInitializing = usePrevious(chainStoreIsInitializing, true)

  const checkAndUpdateChainInfo = useCallback(async () => {
    if (chainStoreIsInitializing) return
    try {
      await chainStore.tryUpdateChain(currentChainId)
    } catch (e) {
      console.error(e)
    }
  }, [chainStore, chainStoreIsInitializing, currentChainId])

  useEffect(() => {
    const appStateHandler = (state: AppStateStatus) => {
      if (state === 'active') {
        checkAndUpdateChainInfo()
      }
    }

    const appStateChangeSubscription = AppState.addEventListener('change', appStateHandler)

    return () => appStateChangeSubscription.remove()
  }, [checkAndUpdateChainInfo])

  useFocusEffect(
    useCallback(() => {
      const isInitialized = !chainStoreIsInitializing && chainStoreIsInitializing !== previousChainStoreIsInitializing
      if (isInitialized || currentChainId !== previousChainId) {
        checkAndUpdateChainInfo()
      }
    }, [
      chainStoreIsInitializing,
      previousChainStoreIsInitializing,
      currentChainId,
      previousChainId,
      checkAndUpdateChainInfo,
    ])
  )

  useEffect(() => {
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollTo({ y: 0 })
    }
  }, [chainStore.current.chainId])

  const onRefresh = useCallback(async () => {
    const account = accountStore.getAccount(chainStore.current.chainId)
    const queries = queriesStore.get(chainStore.current.chainId)

    // Because the components share the states related to the queries,
    // fetching new query responses here would make query responses on all other components also refresh.

    await Promise.all([
      priceStore.waitFreshResponse(),
      ...queries.queryBalances.getQueryBech32Address(account.bech32Address).balances.map((bal) => {
        return bal.waitFreshResponse()
      }),
      queries.cosmos.queryRewards.getQueryBech32Address(account.bech32Address).waitFreshResponse(),
      queries.cosmos.queryDelegations.getQueryBech32Address(account.bech32Address).waitFreshResponse(),
      queries.cosmos.queryUnbondingDelegations.getQueryBech32Address(account.bech32Address).waitFreshResponse(),
    ])

    setRefreshing(false)
  }, [accountStore, chainStore, priceStore, queriesStore])

  return (
    <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />} ref={scrollViewRef}>
      <CoinTypeSelect />
      <Account />
    </ScrollView>
  )
})
