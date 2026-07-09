/**
 * @format
 */
import 'react-native-gesture-handler'

// Global polyfills/shims (crypto, Buffer, process, TextEncoder/TextDecoder, …)
import './shim'

import '@formatjs/intl-getcanonicallocales/polyfill'
import '@formatjs/intl-locale/polyfill'
import '@formatjs/intl-pluralrules/polyfill'
import '@formatjs/intl-pluralrules/locale-data/en' // locale-data for en
import '@formatjs/intl-displaynames/polyfill'
import '@formatjs/intl-displaynames/locale-data/en' // locale-data for en
import '@formatjs/intl-listformat/polyfill'
import '@formatjs/intl-listformat/locale-data/en' // locale-data for en
import '@formatjs/intl-numberformat/polyfill'
import '@formatjs/intl-numberformat/locale-data/en' // locale-data for en
import '@formatjs/intl-relativetimeformat/polyfill'
import '@formatjs/intl-relativetimeformat/locale-data/en' // locale-data for en
import '@formatjs/intl-datetimeformat/polyfill'
import '@formatjs/intl-datetimeformat/locale-data/en' // locale-data for en
import '@formatjs/intl-datetimeformat/add-all-tz' // Add ALL tz data
import 'reflect-metadata'

import registerGetCredentialComponent from '@animo-id/expo-digital-credentials-api/register'
import { theme } from '@heka-wallet/shared'
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native'
import React from 'react'
import { AppRegistry, LogBox, Platform } from 'react-native'

import App from './App'
import { name as appName } from './app.json'
import { DcApiSharingScreen } from './src/screens/DcApiSharingScreen'

LogBox.ignoreAllLogs()

const Base = () => {
  const navigationRef = useNavigationContainerRef()

  return (
    <NavigationContainer ref={navigationRef} theme={theme.NavigationTheme}>
      <App />
    </NavigationContainer>
  )
}

AppRegistry.registerComponent(appName, () => Base)

// Register the standalone overlay rendered by the Digital Credentials API activity (Android only)
if (Platform.OS === 'android') {
  registerGetCredentialComponent(DcApiSharingScreen)
}
