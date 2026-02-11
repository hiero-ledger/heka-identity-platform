import { KeychainServices as BifoldKeychainServices } from '@hyperledger/aries-bifold-core/App/constants'

export enum WalletKeychainServices {
  OAuth = 'secret.heka-wallet.oauth',
  Passkeys = 'secret.heka-wallet.passkeys',
}

export type KeychainServices = WalletKeychainServices | BifoldKeychainServices

export const KeychainServicesList = [
  ...Object.values(WalletKeychainServices),
  ...Object.values(BifoldKeychainServices),
] as const
