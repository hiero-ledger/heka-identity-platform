import { useStore } from '@bifold/core'
import { onTokenRefresh } from '@react-native-firebase/messaging'
import { renderHook, waitFor } from '@testing-library/react-native'

import { mockFunction } from '../../../../jest-helpers/helpers'
import { useHekaAgent } from '../../../src/utils/agent'
import { hasNotificationPermission } from '../../../src/utils/push-notifications/config'
import {
  isDeviceTokenRegistered,
  isPushNotificationsSupported,
  registerDeviceToken,
  ShouldSend,
  unregisterDeviceToken,
} from '../../../src/utils/push-notifications/registration'
import { usePushNotifications } from '../../../src/utils/push-notifications/usePushNotifications'

jest.mock('@bifold/core', () => ({ useStore: jest.fn() }))
jest.mock('@react-native-firebase/messaging', () => ({
  getMessaging: jest.fn(() => ({})),
  onTokenRefresh: jest.fn(),
}))
// utils/agent.ts eagerly imports native/ESM Credo modules; only the hook is needed here.
jest.mock('../../../src/utils/agent', () => ({ useHekaAgent: jest.fn() }))
jest.mock('../../../src/utils/push-notifications/config', () => ({ hasNotificationPermission: jest.fn() }))
jest.mock('../../../src/utils/push-notifications/registration', () => ({
  isDeviceTokenRegistered: jest.fn(),
  isPushNotificationsSupported: jest.fn(),
  registerDeviceToken: jest.fn(async () => true),
  unregisterDeviceToken: jest.fn(async () => true),
}))

const agent = { isInitialized: true, config: { logger: { error: jest.fn() } } }

type Wallet = {
  usePushNotifications?: boolean
  didAuthenticate?: boolean
  isInitialized?: boolean
  permissionGranted?: boolean
  registered?: boolean
}

function givenWallet({
  usePushNotifications = true,
  didAuthenticate = true,
  isInitialized = true,
  permissionGranted = true,
  registered = false,
}: Wallet = {}) {
  agent.isInitialized = isInitialized
  mockFunction(useHekaAgent).mockReturnValue({ agent, setAgent: jest.fn() } as unknown as ReturnType<
    typeof useHekaAgent
  >)
  mockFunction(useStore).mockReturnValue([
    { preferences: { usePushNotifications }, authentication: { didAuthenticate } },
    jest.fn(),
  ] as unknown as ReturnType<typeof useStore>)
  mockFunction(hasNotificationPermission).mockResolvedValue(permissionGranted)
  mockFunction(isDeviceTokenRegistered).mockResolvedValue(registered)
}

// The ShouldSend callback the hook passed with its last send
const lastShouldSend = (fn: { mock: { calls: unknown[][] } }): ShouldSend =>
  fn.mock.calls[fn.mock.calls.length - 1].slice(-1)[0] as ShouldSend

describe('usePushNotifications', () => {
  const unsubscribe = jest.fn()

  beforeEach(() => {
    mockFunction(isPushNotificationsSupported).mockReturnValue(true)
    mockFunction(onTokenRefresh).mockReturnValue(unsubscribe)
  })

  it('registers the device token once the agent is ready, push is on and notifications are allowed', async () => {
    givenWallet()

    renderHook(() => usePushNotifications())

    await waitFor(() => expect(registerDeviceToken).toHaveBeenCalledTimes(1))
    expect(registerDeviceToken).toHaveBeenCalledWith(agent, undefined, expect.any(Function))
    expect(unregisterDeviceToken).not.toHaveBeenCalled()
  })

  it('registers the new token when FCM rotates it, and stops listening on unmount', async () => {
    givenWallet()

    const { unmount } = renderHook(() => usePushNotifications())
    await waitFor(() => expect(registerDeviceToken).toHaveBeenCalledTimes(1))
    mockFunction(onTokenRefresh).mock.calls[0][1]('rotated-token')
    unmount()

    expect(registerDeviceToken).toHaveBeenLastCalledWith(agent, 'rotated-token', expect.any(Function))
    expect(unsubscribe).toHaveBeenCalled()
  })

  it('unregisters when push is off and the mediator may still hold the token', async () => {
    givenWallet({ usePushNotifications: false, registered: true })

    renderHook(() => usePushNotifications())

    await waitFor(() => expect(unregisterDeviceToken).toHaveBeenCalledWith(agent, expect.any(Function)))
    expect(registerDeviceToken).not.toHaveBeenCalled()
    expect(onTokenRefresh).not.toHaveBeenCalled()
  })

  it('unregisters instead of registering when the OS no longer allows notifications', async () => {
    givenWallet({ permissionGranted: false, registered: true })

    renderHook(() => usePushNotifications())

    await waitFor(() => expect(unregisterDeviceToken).toHaveBeenCalled())
    expect(registerDeviceToken).not.toHaveBeenCalled()
  })

  it('sends nothing when push is off and nothing is registered', async () => {
    givenWallet({ usePushNotifications: false, registered: false })

    renderHook(() => usePushNotifications())

    await waitFor(() => expect(isDeviceTokenRegistered).toHaveBeenCalled())
    expect(unregisterDeviceToken).not.toHaveBeenCalled()
    expect(registerDeviceToken).not.toHaveBeenCalled()
  })

  it('cancels a pending register when push is turned off before it is sent', async () => {
    givenWallet()
    const { rerender } = renderHook(() => usePushNotifications())
    await waitFor(() => expect(registerDeviceToken).toHaveBeenCalledTimes(1))
    const pendingRegisterMaySend = lastShouldSend(mockFunction(registerDeviceToken))

    givenWallet({ usePushNotifications: false, registered: true })
    rerender({})

    expect(pendingRegisterMaySend()).toBe(false)
    await waitFor(() => expect(unregisterDeviceToken).toHaveBeenCalled())
    expect(lastShouldSend(mockFunction(unregisterDeviceToken))()).toBe(true)
  })

  it.each([
    ['the wallet is locked', { didAuthenticate: false }],
    ['the agent is not initialized', { isInitialized: false }],
  ])('does nothing when %s', (_, wallet) => {
    givenWallet(wallet)

    renderHook(() => usePushNotifications())

    expect(hasNotificationPermission).not.toHaveBeenCalled()
    expect(isDeviceTokenRegistered).not.toHaveBeenCalled()
    expect(onTokenRefresh).not.toHaveBeenCalled()
  })

  it('does nothing when push is not supported (no Firebase config or iOS)', () => {
    mockFunction(isPushNotificationsSupported).mockReturnValue(false)
    givenWallet()

    renderHook(() => usePushNotifications())

    expect(hasNotificationPermission).not.toHaveBeenCalled()
    expect(registerDeviceToken).not.toHaveBeenCalled()
  })
})
