import { KeplrStackParams } from '@heka-wallet/keplr'
import { SettingStackParams as BifoldSettingStackParams } from '@hyperledger/aries-bifold-core/App/types/navigators'
import { NavigatorScreenParams } from '@react-navigation/core'

import { CredentialSubmissionOption } from '../credentials'

export enum Screens {
  Login = 'Login',
  UserProfile = 'UserProfile',
  WalletRestore = 'WalletRestore',
  OpenIdCredentialOffer = 'OpenIdCredentialOffer',
  OpenIdPresentationRequest = 'OpenIdPresentationRequest',
  PresentationCredentialChange = 'PresentationCredentialChange',
  Onboarding = 'Onboarding',
}

export enum Stacks {
  AuthStack = 'AuthStack',
  SettingsStack = 'SettingsStack',
  BackupStack = 'BackupStack',
  BifoldStack = 'BifoldStack',
  OpenIdStack = 'OpenIdStack',
}

export enum TabStacks {
  BifoldSettingsStack = 'TabBifoldSettingsStack',
  KeplrStack = 'TabKeplrStack',
}

export type AuthStackParams = {
  [Screens.Login]: undefined
}

export type SettingsStackParams = {
  [Screens.UserProfile]: undefined
  [Screens.Onboarding]: undefined
}

export type BackupStackParams = {
  [Screens.WalletRestore]: undefined
}

export type TabStackParams = {
  [TabStacks.BifoldSettingsStack]: NavigatorScreenParams<BifoldSettingStackParams>
  [TabStacks.KeplrStack]: NavigatorScreenParams<KeplrStackParams>
}

export type OpenIdStackParams = {
  [Screens.OpenIdCredentialOffer]: { offer: { uri?: string; data?: string } }
  [Screens.OpenIdPresentationRequest]: { request: { uri?: string; data?: string } }
  // TODO: Find better place for 'PresentationCredentialChange' screen
  [Screens.PresentationCredentialChange]: {
    inputDescriptorId: string
    selectedCredentialId: string
    submissionOptions: CredentialSubmissionOption[]
    onCredentialChange: (inputDescriptorId: string, credentialId: string) => void
  }
}

export type RootStackParams = {
  [Stacks.AuthStack]: NavigatorScreenParams<AuthStackParams>
  [Stacks.SettingsStack]: NavigatorScreenParams<SettingsStackParams>
  [Stacks.BackupStack]: NavigatorScreenParams<BackupStackParams>
  [Stacks.OpenIdStack]: NavigatorScreenParams<OpenIdStackParams>
  // TODO: Find a way to have a proper type here
  [Stacks.BifoldStack]: NavigatorScreenParams<any> | undefined
}
