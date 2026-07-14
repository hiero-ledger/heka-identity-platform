import { KeychainServices as BifoldKeychainServices } from '@bifold/core/src/constants'

export enum WalletKeychainServices {
  OAuth = 'secret.heka-wallet.oauth',
  Passkeys = 'secret.heka-wallet.passkeys',
}

export type KeychainServices = WalletKeychainServices | BifoldKeychainServices

export const KeychainServicesList = [
  ...Object.values(WalletKeychainServices),
  ...Object.values(BifoldKeychainServices),
] as const
