// eslint-disable-next-line import/default
import BluetoothStateManager from 'react-native-bluetooth-state-manager'
import { getSystemName, getSystemVersion } from 'react-native-device-info'
import {
  checkMultiple as checkMultiplePermissions,
  type Permission,
  PERMISSIONS,
  requestMultiple as requestMultiplePermissions,
  RESULTS as PERMISSIONS_RESULTS,
} from 'react-native-permissions'

import { GlobalLogger } from '../logger'

const logger = GlobalLogger.createContextLogger('BLE Utils')

const ANDROID_11_PERMISSIONS: Permission[] = [
  PERMISSIONS.ANDROID.ACCESS_COARSE_LOCATION,
  PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION,
] as Permission[]

const ANDROID_12_PERMISSIONS: Permission[] = [
  PERMISSIONS.ANDROID.BLUETOOTH_ADVERTISE,
  PERMISSIONS.ANDROID.BLUETOOTH_CONNECT,
  PERMISSIONS.ANDROID.BLUETOOTH_SCAN,
]

export async function requestBlePermissions(): Promise<boolean> {
  if (getSystemName().toLowerCase() === 'ios') {
    // iOS handles permissions by itself
    return true
  }

  const osVersion = parseInt(getSystemVersion())

  const permissionsToCheck: Permission[] = []
  if (isNaN(osVersion)) {
    permissionsToCheck.push(...ANDROID_11_PERMISSIONS, ...ANDROID_12_PERMISSIONS)
  } else if (osVersion < 12) {
    permissionsToCheck.push(...ANDROID_11_PERMISSIONS)
  } else {
    permissionsToCheck.push(...ANDROID_12_PERMISSIONS)
  }

  const checkResult = await checkMultiplePermissions(permissionsToCheck)
  logger.debug('Permissions check result', checkResult)

  const requestAndroidPermissionsIfNeeded = async (
    permissionsSet: Permission[]
  ): Promise<'NotAvailable' | 'NotGranted' | 'Granted'> => {
    if (permissionsSet.some((permission) => checkResult[permission] === PERMISSIONS_RESULTS.UNAVAILABLE)) {
      return 'NotAvailable'
    }

    const result = await requestMultiplePermissions(permissionsSet)
    const granted = permissionsSet.every((permission) => result[permission] === PERMISSIONS_RESULTS.GRANTED)
    logger.debug('Ble permissions granted:', granted)

    return granted ? 'Granted' : 'NotGranted'
  }

  const result = await requestAndroidPermissionsIfNeeded(permissionsToCheck)

  const bluetoothState = await BluetoothStateManager.getState()
  logger.debug('Bluetooth state', bluetoothState)

  if (result === 'Granted' && bluetoothState !== 'PoweredOn') {
    logger.debug('Bluetooth permission is granted, but Bluetooth itself is disabled. Requesting user to enable...')
    try {
      const isEnabled = await BluetoothStateManager.requestToEnable()
      if (!isEnabled) {
        logger.warn('User rejected enabling bluetooth')
        return false
      }
    } catch (e: unknown) {
      logger.error('Error enabling bluetooth', e)
      return false
    }
  }

  return result === 'Granted'
}
