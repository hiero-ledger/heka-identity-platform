import {
  Container,
  TokenMapping,
  TOKENS,
  defaultConfig,
  Config,
  Screens as BifoldScreens,
  DefaultScreenOptionsDictionary,
} from '@bifold/core'
import { i18n } from '@bifold/core/src/localization'
import { BaseLogger } from '@credo-ts/core'
import { ColorPalette } from '@heka-wallet/shared'
import { HeaderTitle } from '@react-navigation/elements'
import { StackNavigationOptions } from '@react-navigation/stack'
import React from 'react'
import MaterialCommunityIcon from 'react-native-vector-icons/MaterialCommunityIcons'
import { DependencyContainer } from 'tsyringe'

import { CredentialStack } from './src/navigators/CredentialStack'
import { HomeStack } from './src/navigators/HomeStack'
import { OnboardingStack } from './src/navigators/OnboardingStack'
import { TabStack } from './src/navigators/TabStack'
import {
  CredentialDetails,
  CredentialList,
  Settings,
  Splash,
  Scan,
  Terms,
  TERMS_VERSION,
  AriesCredentialOffer,
  AriesPresentationRequest,
} from './src/screens'
import AttemptLockout from './src/screens/AttemptLockout'
import Chat from './src/screens/Chat'
import Connection from './src/screens/Connection'
import ContactList from './src/screens/ContactList'
import Language from './src/screens/Language'
import Onboarding from './src/screens/Onboarding'
import PINCreate from './src/screens/PINCreate'
import PINEnter from './src/screens/PINEnter'
import ProofDetails from './src/screens/ProofDetails'
import UseBiometry from './src/screens/UseBiometry'
import WhatAreContacts from './src/screens/WhatAreContacts'
import { useDeeplinks } from './src/utils/useDeeplinks'

const configuration: Config = {
  ...defaultConfig,
  autoRedirectConnectionToHome: true,
  connectionTimerDelay: 5000,
  showScanHelp: false,
  showPreface: false,
  enableTours: false,
  globalScreenOptions: {
    headerTintColor: ColorPalette.brand.headerIcon,
    headerShown: true,
    headerBackTitleVisible: false,
    headerTitleContainerStyle: {
      flexShrink: 1,
      marginLeft: 25,
    },
    headerStyle: {
      elevation: 0,
      shadowOffset: { width: 0, height: 6 },
      shadowRadius: 6,
      shadowColor: ColorPalette.grayscale.black,
      shadowOpacity: 0,
      borderBottomWidth: 0,
      backgroundColor: ColorPalette.brand.primaryBackground,
    },
    headerTitleAlign: 'left',
    headerTitle: (props: { children: React.ReactNode }) => <HeaderTitle {...props} />,
    headerBackAccessibilityLabel: i18n.t('Global.Back') as string,
    // Replace React Navigation's default back-icon.png (fails to resolve from a yarn-workspace
    // node_modules path) with a vector glyph that uses the already-bundled MaterialCommunityIcons font.
    headerBackImage: ({ tintColor }: { tintColor?: string }) => (
      <MaterialCommunityIcon name="arrow-left" size={26} color={tintColor ?? ColorPalette.brand.headerIcon} />
    ),
  },
}

// Bifold's DefaultScreenOptionsDictionary sets headerTintColor to white (designed for dark
// onboarding backgrounds). Override all entries to use our headerIcon color for light backgrounds.
const screenOptionsDictionary: Partial<Record<BifoldScreens, StackNavigationOptions>> = Object.fromEntries(
  Object.entries(DefaultScreenOptionsDictionary).map(([screen, options]) => [
    screen,
    options.headerTintColor ? { ...options, headerTintColor: ColorPalette.brand.headerIcon } : options,
  ])
) as Partial<Record<BifoldScreens, StackNavigationOptions>>

screenOptionsDictionary[BifoldScreens.Onboarding] = {
  ...screenOptionsDictionary[BifoldScreens.Onboarding],
  headerShown: false,
}

export class AppContainer implements Container {
  private readonly _container: DependencyContainer
  private log?: BaseLogger

  public constructor(bifoldContainer: Container, log?: BaseLogger) {
    this._container = bifoldContainer.container.createChildContainer()
    this.log = log
  }

  public get container(): DependencyContainer {
    return this._container
  }

  public init(): Container {
    this.log?.info('Initializing Heka Wallet container')

    // Here you can register any component to override components in Bifold package
    // Example: Replacing button in core with custom button
    // this.container.registerInstance(TOKENS.COMPONENT_BUTTON, Button)

    this._container.registerInstance(TOKENS.STACK_TAB, TabStack)
    this._container.registerInstance(TOKENS.STACK_HOME, HomeStack)
    this._container.registerInstance(TOKENS.STACK_CREDENTIAL, CredentialStack)
    this._container.registerInstance(TOKENS.STACK_ONBOARDING, OnboardingStack)

    this._container.registerInstance(TOKENS.SCREEN_SPLASH, Splash)
    this._container.registerInstance(TOKENS.SCREEN_SCAN, Scan)
    this._container.registerInstance(TOKENS.SCREEN_ONBOARDING, Onboarding)
    this._container.registerInstance(TOKENS.SCREEN_TERMS, { screen: Terms, version: TERMS_VERSION })
    this._container.registerInstance(TOKENS.SCREEN_SETTINGS, Settings)
    this._container.registerInstance(TOKENS.SCREEN_CREDENTIAL_LIST, CredentialList)
    this._container.registerInstance(TOKENS.SCREEN_CREDENTIAL_DETAILS, CredentialDetails)
    this._container.registerInstance(TOKENS.SCREEN_CONNECTION, Connection)
    this._container.registerInstance(TOKENS.SCREEN_CONNECTION_LIST, ContactList)
    this._container.registerInstance(TOKENS.SCREEN_CREDENTIAL_OFFER, AriesCredentialOffer)
    this._container.registerInstance(TOKENS.SCREEN_PROOF_REQUEST, AriesPresentationRequest)
    this._container.registerInstance(TOKENS.SCREEN_PIN_CREATE, PINCreate)
    this._container.registerInstance(TOKENS.SCREEN_PIN_ENTER, PINEnter)
    this._container.registerInstance(TOKENS.SCREEN_BIOMETRY, UseBiometry)
    this._container.registerInstance(TOKENS.SCREEN_TOGGLE_BIOMETRY, UseBiometry)
    this._container.registerInstance(TOKENS.SCREEN_ATTEMPT_LOCKOUT, AttemptLockout)
    this._container.registerInstance(TOKENS.SCREEN_LANGUAGE, Language)
    this._container.registerInstance(TOKENS.SCREEN_PROOF_DETAILS, ProofDetails)
    this._container.registerInstance(TOKENS.SCREEN_WHAT_ARE_CONTACTS, WhatAreContacts)
    this._container.registerInstance(TOKENS.SCREEN_CHAT, Chat)

    this._container.registerInstance(TOKENS.HOOK_USE_DEEPLINKS, useDeeplinks)

    this._container.registerInstance(TOKENS.CONFIG, configuration)
    this._container.registerInstance(TOKENS.OBJECT_SCREEN_CONFIG, screenOptionsDictionary)

    return this
  }

  public resolve<K extends keyof TokenMapping>(token: K): TokenMapping[K] {
    return this.container.resolve(token) as TokenMapping[K]
  }

  public resolveAll<K extends keyof TokenMapping, T extends K[]>(
    tokens: [...T]
  ): { [I in keyof T]: TokenMapping[T[I]] } {
    return tokens.map((key) => this.resolve(key)!) as { [I in keyof T]: TokenMapping[T[I]] }
  }
}
