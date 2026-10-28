import type { HekaWalletAgent } from '../agent'

import AsyncStorage from '@react-native-async-storage/async-storage'
import { getApps } from '@react-native-firebase/app'
import { getMessaging, getToken, registerDeviceForRemoteMessages } from '@react-native-firebase/messaging'
import { Platform } from 'react-native'

// Set while the mediator may hold this device's token, so turning push off is retried until it succeeds
const DEVICE_TOKEN_REGISTERED_KEY = 'PUSH_DEVICE_TOKEN_REGISTERED'

/** Lets a caller cancel a send that is still waiting for the token or the mediator lookup. */
export type ShouldSend = () => boolean

/**
 * Push notifications work only when the build has a Firebase config (`android/app/google-services.json`,
 * `ios/HekaWallet/GoogleService-Info.plist`); both are optional.
 */
export function isPushNotificationsSupported(): boolean {
  return (Platform.OS === 'android' || Platform.OS === 'ios') && getApps().length > 0
}

// Sent to the mediator as `device_platform`
function devicePlatform(): string {
  return Platform.OS === 'ios' ? 'ios' : 'android'
}

export async function isDeviceTokenRegistered(): Promise<boolean> {
  return (await AsyncStorage.getItem(DEVICE_TOKEN_REGISTERED_KEY)) === 'true'
}

/**
 * Sends the device token to the default mediator (DIDComm push-notifications-fcm/1.0 `set-device-info`),
 * so the mediator pushes when it queues a message for this wallet. `null` asks it to stop.
 * Returns whether the token was sent; failures are logged, never thrown.
 */
async function sendDeviceToken(
  agent: HekaWalletAgent,
  deviceToken: string | null,
  shouldSend: ShouldSend
): Promise<boolean> {
  const logger = agent.config.logger

  try {
    const mediator = await agent.didcomm.mediationRecipient.findDefaultMediator()
    if (!mediator) {
      logger.warn('Push notifications: no default mediator, device token not sent')
      return false
    }
    // The user may have changed the setting while the token or the mediator was being looked up
    if (!shouldSend()) return false

    await agent.modules.pushNotificationsFcm.setDeviceInfo({
      connectionId: mediator.connectionId,
      // RFC 0734: token and platform are both set, or both null to remove the device
      deviceInfo: { deviceToken, devicePlatform: deviceToken ? devicePlatform() : null },
    })
    await AsyncStorage.setItem(DEVICE_TOKEN_REGISTERED_KEY, String(deviceToken !== null))
    logger.info(`Push notifications: device token ${deviceToken ? 'registered with' : 'removed from'} the mediator`)
    return true
  } catch (error) {
    logger.error(`Push notifications: sending the device token to the mediator failed: ${errorMessage(error)}`)
    return false
  }
}

// The Credo logger serializes an Error object as `{}`
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function registerDeviceToken(
  agent: HekaWalletAgent,
  token?: string,
  shouldSend: ShouldSend = () => true
): Promise<boolean> {
  if (!isPushNotificationsSupported()) return false

  let deviceToken = token
  if (!deviceToken) {
    try {
      const messaging = getMessaging()
      // iOS: automatic APNs registration is off (`app/firebase.json`) — on a build without the Firebase plist it
      // would hand the APNs token to an unconfigured Firebase; register here, where Firebase is known to exist.
      // Always register: RNFB resolves at once when already registered, and its `isDeviceRegisteredForRemoteMessages`
      // can report true before any registration (it defaults to true when the native value is missing).
      if (Platform.OS === 'ios') {
        await registerDeviceForRemoteMessages(messaging)
      }
      deviceToken = await getToken(messaging)
    } catch (error) {
      agent.config.logger.error(`Push notifications: getting the FCM token failed: ${errorMessage(error)}`)
      return false
    }
  }

  return sendDeviceToken(agent, deviceToken, shouldSend)
}

export async function unregisterDeviceToken(
  agent: HekaWalletAgent,
  shouldSend: ShouldSend = () => true
): Promise<boolean> {
  if (!isPushNotificationsSupported()) return false

  return sendDeviceToken(agent, null, shouldSend)
}
