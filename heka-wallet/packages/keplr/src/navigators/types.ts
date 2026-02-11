import { BIP44HDPath } from '@keplr-wallet/background'
import { RegisterConfig } from '@keplr-wallet/hooks'

import { NewMnemonicConfig } from '../common'

export enum Screens {
  Unlock = 'Unlock',
  Home = 'Home',
  Send = 'Send',
  RegisterIntro = 'RegisterIntro',
  RegisterNewUser = 'RegisterNewUser',
  RegisterNotNewUser = 'RegisterNotNewUser',
  RegisterEnd = 'RegisterEnd',
  NewMnemonic = 'NewMnemonic',
  VerifyMnemonic = 'VerifyMnemonic',
  RecoverMnemonic = 'RecoverMnemonic',
  NewLedger = 'NewLedger',
  SelectAccount = 'SelectAccount',
}

export enum Stacks {
  RegisterStack = 'RegisterStack',
  AuthStack = 'AuthStack',
  MainStack = 'MainStack',
}

export type KeplrStackParams = {
  [Stacks.RegisterStack]: undefined
  [Stacks.AuthStack]: undefined
  [Stacks.MainStack]: undefined
}

export type RegisterStackParams = {
  [Screens.RegisterIntro]: undefined
  [Screens.NewMnemonic]: { registerConfig: RegisterConfig }
  [Screens.VerifyMnemonic]: {
    registerConfig: RegisterConfig
    newMnemonicConfig: NewMnemonicConfig
    bip44HDPath: BIP44HDPath
  }
  [Screens.RecoverMnemonic]: { registerConfig: RegisterConfig }
  [Screens.NewLedger]: undefined
  [Screens.RegisterEnd]: { password?: string }
}

export type AuthStackParams = {
  [Screens.Unlock]: undefined
}

export type MainStackParams = {
  [Screens.Home]: undefined
  [Screens.SelectAccount]: undefined
  [Screens.Send]: { chainId?: string; currency?: string; recipient?: string }
}
