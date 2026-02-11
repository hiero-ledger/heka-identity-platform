import { MultiKeyStoreInfoElem } from '@keplr-wallet/background'

export function getKeyStoreParagraph(keyStore: MultiKeyStoreInfoElem): string | undefined {
  const bip44HDPath = keyStore.bip44HDPath ?? {
    account: 0,
    change: 0,
    addressIndex: 0,
  }

  const changeAndIndexSegment =
    bip44HDPath.change !== 0 || bip44HDPath.addressIndex !== 0
      ? `/${bip44HDPath.change}/${bip44HDPath.addressIndex}`
      : ''

  switch (keyStore.type) {
    case 'ledger':
      return `Ledger - m/44'/118'/${bip44HDPath.account}'${changeAndIndexSegment}`
    case 'mnemonic':
      return bip44HDPath.account !== 0 || !!changeAndIndexSegment
        ? `Mnemonic - m/44'/-/${bip44HDPath.account}'${changeAndIndexSegment}`
        : undefined
    case 'privateKey':
      // Torus key
      return keyStore.meta?.email
  }
}
