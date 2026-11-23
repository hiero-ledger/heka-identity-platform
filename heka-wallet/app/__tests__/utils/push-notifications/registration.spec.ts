import { getApps } from '@react-native-firebase/app'
import {
  getToken,
  isDeviceRegisteredForRemoteMessages,
  registerDeviceForRemoteMessages,
} from '@react-native-firebase/messaging'
import { Platform } from 'react-native'

import { mockFunction } from '../../../../jest-helpers/helpers'
import type { HekaWalletAgent } from '../../../src/utils/agent'
import {
  isDeviceTokenRegistered,
  isPushNotificationsSupported,
  registerDeviceToken,
  unregisterDeviceToken,
} from '../../../src/utils/push-notifications/registration'
import AsyncStorage from '@react-native-async-storage/async-storage'

jest.mock('@react-native-firebase/app', () => ({ getApps: jest.fn() }))
jest.mock('@react-native-firebase/messaging', () => ({
  getMessaging: jest.fn(() => ({})),
  getToken: jest.fn(),
  isDeviceRegisteredForRemoteMessages: jest.fn(() => false),
  registerDeviceForRemoteMessages: jest.fn(async () => undefined),
}))

const MEDIATOR_CONNECTION_ID = 'mediator-connection-id'
const FCM_TOKEN = 'fcm-device-token'

function createAgent() {
  const agent = {
    config: { logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } },
    didcomm: {
      mediationRecipient: {
        findDefaultMediator: jest.fn(async () => ({ connectionId: MEDIATOR_CONNECTION_ID })),
      },
    },
    modules: { pushNotificationsFcm: { setDeviceInfo: jest.fn(async () => undefined) } },
  }
  return { agent, hekaAgent: agent as unknown as HekaWalletAgent }
}

describe('push notifications registration', () => {
  beforeEach(async () => {
    Platform.OS = 'android'
    mockFunction(getApps).mockReturnValue([{} as ReturnType<typeof getApps>[number]])
    mockFunction(getToken).mockResolvedValue(FCM_TOKEN)
    await AsyncStorage.clear()
  })

  it('remembers that the mediator holds the token after registering, and forgets it after unregistering', async () => {
    const { hekaAgent } = createAgent()

    await registerDeviceToken(hekaAgent)
    await expect(isDeviceTokenRegistered()).resolves.toBe(true)

    await unregisterDeviceToken(hekaAgent)
    await expect(isDeviceTokenRegistered()).resolves.toBe(false)
  })

  it('keeps the registered mark when unregistering fails, so it can be retried', async () => {
    const { agent, hekaAgent } = createAgent()
    await registerDeviceToken(hekaAgent)
    agent.modules.pushNotificationsFcm.setDeviceInfo.mockRejectedValue(new Error('mediator unreachable'))

    await expect(unregisterDeviceToken(hekaAgent)).resolves.toBe(false)

    await expect(isDeviceTokenRegistered()).resolves.toBe(true)
  })

  it('marks the token as possibly registered before sending it', async () => {
    const { agent, hekaAgent } = createAgent()
    let registeredWhileSending: boolean | undefined
    agent.modules.pushNotificationsFcm.setDeviceInfo.mockImplementation(async () => {
      registeredWhileSending = await isDeviceTokenRegistered()
    })

    await registerDeviceToken(hekaAgent)

    expect(registeredWhileSending).toBe(true)
  })

  it('keeps the registered mark when sending the token fails, as the mediator may have received it', async () => {
    const { agent, hekaAgent } = createAgent()
    agent.modules.pushNotificationsFcm.setDeviceInfo.mockRejectedValue(new Error('response timed out'))

    await expect(registerDeviceToken(hekaAgent)).resolves.toBe(false)

    await expect(isDeviceTokenRegistered()).resolves.toBe(true)
  })

  it('does not send the token when the registered mark cannot be stored', async () => {
    const { agent, hekaAgent } = createAgent()
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('storage full'))

    await expect(registerDeviceToken(hekaAgent)).resolves.toBe(false)

    expect(agent.modules.pushNotificationsFcm.setDeviceInfo).not.toHaveBeenCalled()
    expect(agent.config.logger.error).toHaveBeenCalled()
  })

  it('does not send when the caller cancelled while the token was being fetched', async () => {
    const { agent, hekaAgent } = createAgent()

    await expect(registerDeviceToken(hekaAgent, undefined, () => false)).resolves.toBe(false)

    expect(agent.modules.pushNotificationsFcm.setDeviceInfo).not.toHaveBeenCalled()
    await expect(isDeviceTokenRegistered()).resolves.toBe(false)
  })

  it('sends the FCM token and platform to the default mediator connection', async () => {
    const { agent, hekaAgent } = createAgent()

    await expect(registerDeviceToken(hekaAgent)).resolves.toBe(true)

    expect(agent.modules.pushNotificationsFcm.setDeviceInfo).toHaveBeenCalledWith({
      connectionId: MEDIATOR_CONNECTION_ID,
      deviceInfo: { deviceToken: FCM_TOKEN, devicePlatform: 'android' },
    })
  })

  it('sends a refreshed token as given, without asking FCM again', async () => {
    const { agent, hekaAgent } = createAgent()

    await registerDeviceToken(hekaAgent, 'refreshed-token')

    expect(getToken).not.toHaveBeenCalled()
    expect(agent.modules.pushNotificationsFcm.setDeviceInfo).toHaveBeenCalledWith({
      connectionId: MEDIATOR_CONNECTION_ID,
      deviceInfo: { deviceToken: 'refreshed-token', devicePlatform: 'android' },
    })
  })

  it('sends a null token and platform to stop pushes when unregistering', async () => {
    const { agent, hekaAgent } = createAgent()

    await expect(unregisterDeviceToken(hekaAgent)).resolves.toBe(true)

    // RFC 0734 / DidCommPushNotificationsFcmService: both null, or the message is refused
    expect(agent.modules.pushNotificationsFcm.setDeviceInfo).toHaveBeenCalledWith({
      connectionId: MEDIATOR_CONNECTION_ID,
      deviceInfo: { deviceToken: null, devicePlatform: null },
    })
  })

  it('sends nothing when the wallet has no default mediator', async () => {
    const { agent, hekaAgent } = createAgent()
    agent.didcomm.mediationRecipient.findDefaultMediator.mockResolvedValue(null as never)

    await expect(registerDeviceToken(hekaAgent)).resolves.toBe(false)

    expect(agent.modules.pushNotificationsFcm.setDeviceInfo).not.toHaveBeenCalled()
    expect(agent.config.logger.warn).toHaveBeenCalled()
  })

  it('logs and does not throw when the mediator cannot be reached', async () => {
    const { agent, hekaAgent } = createAgent()
    agent.modules.pushNotificationsFcm.setDeviceInfo.mockRejectedValue(new Error('outbound transport failed'))

    await expect(registerDeviceToken(hekaAgent)).resolves.toBe(false)

    expect(agent.config.logger.error).toHaveBeenCalled()
  })

  it('is not supported and does nothing without a Firebase config', async () => {
    mockFunction(getApps).mockReturnValue([])
    const { agent, hekaAgent } = createAgent()

    expect(isPushNotificationsSupported()).toBe(false)
    await expect(registerDeviceToken(hekaAgent)).resolves.toBe(false)

    expect(getToken).not.toHaveBeenCalled()
    expect(agent.modules.pushNotificationsFcm.setDeviceInfo).not.toHaveBeenCalled()
  })

  it('on iOS registers with APNs first and sends the token with platform ios', async () => {
    Platform.OS = 'ios'
    const { agent, hekaAgent } = createAgent()

    await expect(registerDeviceToken(hekaAgent)).resolves.toBe(true)

    expect(registerDeviceForRemoteMessages).toHaveBeenCalled()
    expect(mockFunction(registerDeviceForRemoteMessages).mock.invocationCallOrder[0]).toBeLessThan(
      mockFunction(getToken).mock.invocationCallOrder[0]
    )
    expect(agent.modules.pushNotificationsFcm.setDeviceInfo).toHaveBeenCalledWith({
      connectionId: MEDIATOR_CONNECTION_ID,
      deviceInfo: { deviceToken: FCM_TOKEN, devicePlatform: 'ios' },
    })
  })

  it('on iOS registers with APNs even when RNFB reports the device as already registered', async () => {
    Platform.OS = 'ios'
    mockFunction(isDeviceRegisteredForRemoteMessages).mockReturnValueOnce(true)
    const { hekaAgent } = createAgent()

    await expect(registerDeviceToken(hekaAgent)).resolves.toBe(true)

    expect(registerDeviceForRemoteMessages).toHaveBeenCalled()
  })

  it('on iOS logs and sends nothing when APNs registration fails', async () => {
    Platform.OS = 'ios'
    mockFunction(registerDeviceForRemoteMessages).mockRejectedValueOnce(
      new Error('registerDeviceForRemoteMessages requested but system did not respond')
    )
    const { agent, hekaAgent } = createAgent()

    await expect(registerDeviceToken(hekaAgent)).resolves.toBe(false)

    expect(getToken).not.toHaveBeenCalled()
    expect(agent.modules.pushNotificationsFcm.setDeviceInfo).not.toHaveBeenCalled()
    expect(agent.config.logger.error).toHaveBeenCalled()
  })

  it('on Android does not register with APNs', async () => {
    const { hekaAgent } = createAgent()

    await registerDeviceToken(hekaAgent)

    expect(registerDeviceForRemoteMessages).not.toHaveBeenCalled()
  })

  it('is not supported on iOS without a Firebase config and does nothing there', async () => {
    Platform.OS = 'ios'
    mockFunction(getApps).mockReturnValue([])
    const { agent, hekaAgent } = createAgent()

    expect(isPushNotificationsSupported()).toBe(false)
    await expect(registerDeviceToken(hekaAgent)).resolves.toBe(false)

    expect(registerDeviceForRemoteMessages).not.toHaveBeenCalled()
    expect(agent.modules.pushNotificationsFcm.setDeviceInfo).not.toHaveBeenCalled()
  })
})
