import { HekaTheme, useHekaTheme, IconButton } from '@heka-wallet/shared'
import { MultiKeyStoreInfoWithSelectedElem } from '@keplr-wallet/background'
import { useNavigation } from '@react-navigation/native'
import { StackNavigationProp } from '@react-navigation/stack'
import { observer } from 'mobx-react-lite'
import React, { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import { ScrollView } from 'react-native-gesture-handler'

import { useKeplrStore } from '../KeplrStoreProvider'
import { AccountItem } from '../components/misc'
import { RemoveAccountModal, useRemoveAccountModal } from '../components/modals'
import { MainStackParams, Screens } from '../navigators/types'
import { getKeyStoreParagraph } from '../utils/keystore'

const useStyles = (theme: HekaTheme) =>
  StyleSheet.create({
    group: {
      marginBottom: theme.Spacing.md,
      backgroundColor: theme.ColorPallet.brand.primaryBackground,
    },
    groupTitle: {
      ...theme.TextTheme.headingFour,
      padding: theme.Spacing.md,
    },
    accountItem: {
      borderTopWidth: theme.BorderWidth.small,
      borderColor: theme.ColorPallet.grayscale.lightGrey,
    },
  })

export const SelectAccount: React.FC = observer(() => {
  const { t } = useTranslation()

  const navigation = useNavigation<StackNavigationProp<MainStackParams>>()

  const { keyRingStore } = useKeplrStore()

  const {
    isVisible: isRemoveModalVisible,
    keyStore: keyStoreToRemove,
    show: showRemoveModal,
    hide: hideRemoveModal,
  } = useRemoveAccountModal()

  const keyStoresGroups = useMemo<AccountGroupData[]>(
    () => [
      {
        title: t('Crypto.MnemonicSeed'),
        items: keyRingStore.multiKeyStoreInfo.filter((keyStore) => !keyStore.type || keyStore.type === 'mnemonic'),
      },
      {
        title: t('Crypto.HardwareWallet'),
        items: keyRingStore.multiKeyStoreInfo.filter((keyStore) => keyStore.type === 'ledger'),
      },
      {
        title: t('Crypto.PrivateKey'),
        items: keyRingStore.multiKeyStoreInfo.filter(
          (keyStore) => keyStore.type === 'privateKey' && !keyStore.meta?.email
        ),
      },
    ],
    [t, keyRingStore.multiKeyStoreInfo]
  )

  const selectAccount = async (keyStore: MultiKeyStoreInfoWithSelectedElem) => {
    const index = keyRingStore.multiKeyStoreInfo.indexOf(keyStore)
    if (index >= 0) {
      await keyRingStore.changeKeyRing(index)
      navigation.navigate(Screens.Home)
    }
  }

  const deleteAccount = (keyStore: MultiKeyStoreInfoWithSelectedElem) => {
    showRemoveModal(keyStore)
  }

  return (
    <ScrollView>
      {keyStoresGroups.map((group, index) => {
        return <AccountGroup key={index} data={group} onSelectAccount={selectAccount} onAccountDelete={deleteAccount} />
      })}
      <RemoveAccountModal isVisible={isRemoveModalVisible} keyStore={keyStoreToRemove} onClose={hideRemoveModal} />
    </ScrollView>
  )
})

interface AccountGroupData {
  title: string
  items: MultiKeyStoreInfoWithSelectedElem[]
}

interface AccountGroupProps {
  data: AccountGroupData
  onSelectAccount: (keyStore: MultiKeyStoreInfoWithSelectedElem) => Promise<void>
  onAccountDelete: (keyStore: MultiKeyStoreInfoWithSelectedElem) => void
}

const AccountGroup: React.FC<AccountGroupProps> = ({ data, onSelectAccount, onAccountDelete }) => {
  const theme = useHekaTheme()
  const styles = useStyles(theme)

  const { t } = useTranslation()

  const getAccountLabel = useCallback(
    (keyStore: MultiKeyStoreInfoWithSelectedElem): string => {
      const accountName = keyStore.meta?.name ?? t('Crypto.Account.KeplrAccount')
      return keyStore.selected ? t('Crypto.Account.Selected', { name: accountName }) : accountName
    },
    [t]
  )

  const { title, items } = data

  if (!items.length) return null
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{title}</Text>
      {items.map((keyStore, index) => {
        return (
          <AccountItem
            key={index}
            containerStyle={styles.accountItem}
            label={getAccountLabel(keyStore)}
            paragraph={getKeyStoreParagraph(keyStore)}
            right={
              <IconButton
                onPress={() => onAccountDelete(keyStore)}
                iconName={'trash3'}
                iconColor={theme.ColorPallet.semantic.error}
              />
            }
            onPress={() => onSelectAccount(keyStore)}
            disabled={keyStore.selected}
          />
        )
      })}
    </View>
  )
}
