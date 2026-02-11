import AsyncStorage from '@react-native-async-storage/async-storage'
import { useEffect, useState } from 'react'
import { Platform } from 'react-native'
import Keychain from 'react-native-keychain'

import { KeychainServices, KeychainServicesList } from '../types/keychain'

export const APP_LAUNCHED_KEY = 'AppLaunched'

export const useIOSKeychainResetOnFirstLaunch = () => {
  const [inProgress, setInProgress] = useState(true)

  useEffect(() => {
    if (Platform.OS !== 'ios') {
      setInProgress(false)
      return
    }

    // We're using RN AsyncStorage to track first launch of the app
    // If app was launched for a first time, we want to reset Keychain data
    AsyncStorage.getItem(APP_LAUNCHED_KEY)
      .then(async (appLaunchedBefore) => {
        if (appLaunchedBefore) return
        await resetKeychainData()
        await AsyncStorage.setItem(APP_LAUNCHED_KEY, 'true')
      })
      .finally(() => setInProgress(false))
  }, [])

  return { inProgress }
}

export async function resetKeychainData(): Promise<void> {
  for (const service of KeychainServicesList) {
    await Keychain.resetGenericPassword({ service })
  }
}

export function getKeychainAccessOptions(service: KeychainServices, useBiometrics = false): Keychain.Options {
  const options: Keychain.Options = {
    service,
    accessible: useBiometrics ? Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY : Keychain.ACCESSIBLE.ALWAYS,
    accessControl: useBiometrics ? Keychain.ACCESS_CONTROL.BIOMETRY_ANY : undefined,
  }

  if (Platform.OS === 'android') {
    options.securityLevel = Keychain.SECURITY_LEVEL.ANY
    options.storage = useBiometrics ? Keychain.STORAGE_TYPE.RSA : Keychain.STORAGE_TYPE.AES
  }

  return options
}
