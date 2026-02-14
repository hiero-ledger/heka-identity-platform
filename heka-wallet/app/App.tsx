import { KeplrStoreProvider } from '@heka-wallet/keplr'
import { theme } from '@heka-wallet/shared'
import {
  AgentProvider,
  animatedComponents,
  AnimatedComponentsProvider,
  AuthProvider,
  initLanguages,
  initStoredLanguage,
  NetworkProvider,
  StoreProvider as BifoldStoreProvider,
  ThemeProvider,
  MainContainer,
  ContainerProvider,
} from '@hyperledger/aries-bifold-core'
import React, { useEffect } from 'react'
import { StatusBar } from 'react-native'
import { PaperProvider } from 'react-native-paper'
import SplashScreen from 'react-native-splash-screen'
import Toast from 'react-native-toast-message'
import { container } from 'tsyringe'

import { AppContainer } from './container-impl'
import { localization, RootStoreProvider } from './src'
import { ToastConfig } from './src/components/misc/Toast'
import { ErrorModal } from './src/components/modals/ErrorModal'
import { keplrConfig } from './src/config'
import { MdocRecordProvider, SdJwtVcRecordProvider, W3cCredentialRecordProvider } from './src/contexts'
import { RootStack } from './src/navigators'
import { useIOSKeychainResetOnFirstLaunch } from './src/utils/keychain'

// TODO: Find a good way to extract module-specific localization (for example, for Keplr integration)
initLanguages(localization)

const bifoldContainer = new MainContainer(container.createChildContainer()).init()
const hekaWalletContainer = new AppContainer(bifoldContainer).init()

const App = () => {
  useEffect(() => {
    initStoredLanguage()
  }, [])

  useEffect(() => {
    // Hide the native splash / loading screen so that our
    // RN version can be displayed.
    SplashScreen.hide()
  }, [])

  // This is required for consistent Keychain behavior on iOS and Android in cases where user re-installs the app
  // We want to clear Keychain data after deleting the app, but it's not possible on iOS
  // So we need to manually reset keychain data on first app launch on iOS
  // See https://github.com/oblador/react-native-keychain/issues/135
  const { inProgress: keychainResetInProgress } = useIOSKeychainResetOnFirstLaunch()

  // TODO: Find a way to show splash instead of a blank screen
  // Do not render anything before keychain reset is completed
  if (keychainResetInProgress) return null
  return (
    <ContainerProvider value={hekaWalletContainer}>
      <BifoldStoreProvider>
        <RootStoreProvider>
          <KeplrStoreProvider config={keplrConfig}>
            <AgentProvider agent={undefined}>
              <W3cCredentialRecordProvider>
                <SdJwtVcRecordProvider>
                  <MdocRecordProvider>
                    <ThemeProvider value={theme}>
                      <PaperProvider theme={theme.PaperTheme}>
                        <AnimatedComponentsProvider value={animatedComponents}>
                          <AuthProvider>
                            <NetworkProvider>
                              <StatusBar
                                hidden={false}
                                barStyle="dark-content"
                                backgroundColor={theme.ColorPallet.brand.primaryBackground}
                                translucent={false}
                              />
                              <RootStack />
                              <ErrorModal />
                              <Toast config={ToastConfig} position="bottom" />
                            </NetworkProvider>
                          </AuthProvider>
                        </AnimatedComponentsProvider>
                      </PaperProvider>
                    </ThemeProvider>
                  </MdocRecordProvider>
                </SdJwtVcRecordProvider>
              </W3cCredentialRecordProvider>
            </AgentProvider>
          </KeplrStoreProvider>
        </RootStoreProvider>
      </BifoldStoreProvider>
    </ContainerProvider>
  )
}

export default App
