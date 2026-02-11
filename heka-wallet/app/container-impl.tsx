import { BaseLogger } from '@credo-ts/core'
import { ColorPallet } from '@heka-wallet/shared'
import { Container, TokenMapping, TOKENS } from '@hyperledger/aries-bifold-core'
import HeaderTitle from '@hyperledger/aries-bifold-core/App/components/texts/HeaderTitle'
import { defaultConfig } from '@hyperledger/aries-bifold-core/App/container-impl'
import i18n from 'i18next'
import React from 'react'
import { DependencyContainer } from 'tsyringe'

import { CredentialStack } from './src/navigators/CredentialStack'
import { HomeStack } from './src/navigators/HomeStack'
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

const configuration = {
  ...defaultConfig,
  autoRedirectConnectionToHome: true,
  connectionTimerDelay: 5000,
  showScanHelp: false,
  showPreface: false,
  globalScreenOptions: {
    headerTintColor: ColorPallet.brand.headerIcon,
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
      shadowColor: ColorPallet.grayscale.black,
      shadowOpacity: 0,
      borderBottomWidth: 0,
      backgroundColor: ColorPallet.brand.primaryBackground,
    },
    headerTitleAlign: 'left',
    headerTitle: (props: { children: React.ReactNode }) => <HeaderTitle {...props} />,
    headerBackAccessibilityLabel: i18n.t('Global.Back'),
  },
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
    // this.container.registerInstance(TOKENS.COMP_BUTTON, Button)

    this._container.registerInstance(TOKENS.STACK_TAB, TabStack)
    this._container.registerInstance(TOKENS.STACK_HOME, HomeStack)
    this._container.registerInstance(TOKENS.STACK_CREDENTIAL, CredentialStack)

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
    this._container.registerInstance(TOKENS.SCREEN_USE_BIOMETRY, UseBiometry)
    this._container.registerInstance(TOKENS.SCREEN_ATTEMPT_LOCKOUT, AttemptLockout)
    this._container.registerInstance(TOKENS.SCREEN_LANGUAGE, Language)
    this._container.registerInstance(TOKENS.SCREEN_PROOF_DETAILS, ProofDetails)
    this._container.registerInstance(TOKENS.SCREEN_WHAT_ARE_CONTACTS, WhatAreContacts)
    this._container.registerInstance(TOKENS.SCREEN_CHAT, Chat)

    this._container.registerInstance(TOKENS.HOOK_USE_DEEPLINKS, useDeeplinks)

    this._container.registerInstance(TOKENS.CONFIG, configuration)

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
