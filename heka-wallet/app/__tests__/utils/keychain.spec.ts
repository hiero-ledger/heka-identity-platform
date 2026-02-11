import { getKeychainAccessOptions, resetKeychainData, useIOSKeychainResetOnFirstLaunch } from '../../src/utils/keychain'
import Keychain from 'react-native-keychain'
import { KeychainServicesList } from '../../src/types/keychain'
import { Platform } from 'react-native'
import { KeychainServices } from '@hyperledger/aries-bifold-core/App/constants'
import { renderHook, waitFor } from '@testing-library/react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { APP_LAUNCHED_KEY } from '../../src/utils/keychain'
import { mockFunction } from '../../../jest-helpers/helpers'

const testKeychainServiceName = KeychainServices.Key

describe('Keychain Utils', () => {
  describe('useiOSKeychainResetOnFirstLaunch', () => {
    beforeEach(() => {
      Platform.OS = 'ios'
    })

    it('should reset keychain and set flag in AsyncStorage', async () => {
      const { result } = renderHook(() => useIOSKeychainResetOnFirstLaunch())

      await waitFor(() => expect(result.current.inProgress).toBe(false))

      expect(AsyncStorage.getItem).toBeCalledTimes(1)
      expect(AsyncStorage.getItem).toBeCalledWith(APP_LAUNCHED_KEY)

      expect(Keychain.resetGenericPassword).toBeCalled()

      expect(AsyncStorage.setItem).toBeCalledTimes(1)
      expect(AsyncStorage.setItem).toBeCalledWith(APP_LAUNCHED_KEY, 'true')
    })

    it('should skip execution if flag is already set in AsyncStorage', async () => {
      mockFunction(AsyncStorage.getItem).mockResolvedValueOnce('true')

      const { result } = renderHook(() => useIOSKeychainResetOnFirstLaunch())

      await waitFor(() => expect(result.current.inProgress).toBe(false))

      expect(AsyncStorage.getItem).toBeCalledTimes(1)
      expect(AsyncStorage.getItem).toBeCalledWith(APP_LAUNCHED_KEY)

      expect(Keychain.resetGenericPassword).toBeCalledTimes(0)

      expect(AsyncStorage.setItem).toBeCalledTimes(0)
    })

    it('should skip execution on Android', async () => {
      Platform.OS = 'android'

      const { result } = renderHook(() => useIOSKeychainResetOnFirstLaunch())

      await waitFor(() => expect(result.current.inProgress).toBe(false))

      expect(AsyncStorage.getItem).toBeCalledTimes(0)
      expect(Keychain.resetGenericPassword).toBeCalledTimes(0)
      expect(AsyncStorage.setItem).toBeCalledTimes(0)
    })
  })

  describe('resetKeychainData', () => {
    it('should reset all keychain services', async () => {
      const resetGenericPasswordSpy = jest.spyOn(Keychain, 'resetGenericPassword')

      await resetKeychainData()

      expect(Keychain.resetGenericPassword).toBeCalledTimes(KeychainServicesList.length)
      expect(resetGenericPasswordSpy.mock.calls).toEqual(KeychainServicesList.map((service) => [{ service }]))
    })
  })

  describe('getKeychainAccessOptions', () => {
    it.each(['android', 'ios'] as const)('should return correct options for platforms', (platform) => {
      Platform.OS = platform

      const options = getKeychainAccessOptions(testKeychainServiceName)

      expect(options.service).toBe(testKeychainServiceName)
      expect(options.accessible).toBe(Keychain.ACCESSIBLE.ALWAYS)
      expect(options.accessControl).toBeUndefined()

      if (platform === 'android') {
        expect(options.securityLevel).toBe(Keychain.SECURITY_LEVEL.ANY)
        expect(options.storage).toBe(Keychain.STORAGE_TYPE.AES)
      }

      const optionsWithBiometry = getKeychainAccessOptions(testKeychainServiceName, true)

      expect(optionsWithBiometry.service).toBe(testKeychainServiceName)
      expect(optionsWithBiometry.accessible).toBe(Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY)
      expect(optionsWithBiometry.accessControl).toBe(Keychain.ACCESS_CONTROL.BIOMETRY_ANY)

      if (platform === 'android') {
        expect(optionsWithBiometry.securityLevel).toBe(Keychain.SECURITY_LEVEL.ANY)
        expect(optionsWithBiometry.storage).toBe(Keychain.STORAGE_TYPE.RSA)
      }
    })
  })
})
