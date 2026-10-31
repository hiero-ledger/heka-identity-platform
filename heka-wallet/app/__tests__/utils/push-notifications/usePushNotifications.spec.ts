import { useStore } from '@bifold/core'
import { onTokenRefresh } from '@react-native-firebase/messaging'
import { act, renderHook, waitFor } from '@testing-library/react-native'

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
import { SYNC_RETRY_DELAYS_MS, usePushNotifications } from '../../../src/utils/push-notifications/usePushNotifications'

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
    await act(async () => mockFunction(onTokenRefresh).mock.calls[0][1]('rotated-token'))
    unmount()

    expect(registerDeviceToken).toHaveBeenLastCalledWith(agent, 'rotated-token', expect.any(Function))
    expect(unsubscribe).toHaveBeenCalled()
  })

  it('does not register a rotated token once the OS no longer allows notifications', async () => {
    givenWallet()
    renderHook(() => usePushNotifications())
    await waitFor(() => expect(registerDeviceToken).toHaveBeenCalledTimes(1))

    mockFunction(hasNotificationPermission).mockResolvedValue(false)
    await act(async () => mockFunction(onTokenRefresh).mock.calls[0][1]('rotated-token'))

    expect(registerDeviceToken).toHaveBeenCalledTimes(1)
    expect(registerDeviceToken).not.toHaveBeenCalledWith(agent, 'rotated-token', expect.any(Function))
  })

  it('logs instead of throwing when the permission check fails on token rotation', async () => {
    givenWallet()
    renderHook(() => usePushNotifications())
    await waitFor(() => expect(registerDeviceToken).toHaveBeenCalledTimes(1))

    mockFunction(hasNotificationPermission).mockRejectedValue(new Error('permission check failed'))
    await act(async () => mockFunction(onTokenRefresh).mock.calls[0][1]('rotated-token'))

    expect(registerDeviceToken).toHaveBeenCalledTimes(1)
    expect(agent.config.logger.error).toHaveBeenCalledWith(expect.stringContaining('permission check failed'))
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

  it('turns push off only after a register already on its way to the mediator has finished', async () => {
    let registered = false
    let finishRegister = (): void => undefined
    givenWallet()
    mockFunction(registerDeviceToken).mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          finishRegister = () => {
            registered = true
            resolve(true)
          }
        })
    )
    const { rerender } = renderHook(() => usePushNotifications())
    await waitFor(() => expect(registerDeviceToken).toHaveBeenCalledTimes(1))

    givenWallet({ usePushNotifications: false })
    mockFunction(isDeviceTokenRegistered).mockImplementation(async () => registered)
    rerender({})
    await act(async () => undefined)
    expect(isDeviceTokenRegistered).not.toHaveBeenCalled()

    await act(async () => finishRegister())

    await waitFor(() => expect(unregisterDeviceToken).toHaveBeenCalledTimes(1))
  })

  it('turns push back on only after a pending unregister has finished', async () => {
    let finishUnregister = (): void => undefined
    givenWallet({ usePushNotifications: false, registered: true })
    mockFunction(unregisterDeviceToken).mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          finishUnregister = () => resolve(true)
        })
    )
    const { rerender } = renderHook(() => usePushNotifications())
    await waitFor(() => expect(unregisterDeviceToken).toHaveBeenCalledTimes(1))

    givenWallet()
    rerender({})
    await act(async () => undefined)
    expect(registerDeviceToken).not.toHaveBeenCalled()

    await act(async () => finishUnregister())

    await waitFor(() => expect(registerDeviceToken).toHaveBeenCalledTimes(1))
  })

  describe('when the mediator does not accept the sync', () => {
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => {
      jest.useRealTimers()
      // clearMocks keeps implementations; restore the module mock's success for the other tests
      mockFunction(registerDeviceToken).mockReset().mockResolvedValue(true)
      mockFunction(unregisterDeviceToken).mockReset().mockResolvedValue(true)
    })

    it('retries registering after a delay', async () => {
      givenWallet()
      mockFunction(registerDeviceToken).mockResolvedValueOnce(false)
      renderHook(() => usePushNotifications())
      await waitFor(() => expect(registerDeviceToken).toHaveBeenCalledTimes(1))

      await act(async () => jest.advanceTimersByTime(SYNC_RETRY_DELAYS_MS[0]))

      await waitFor(() => expect(registerDeviceToken).toHaveBeenCalledTimes(2))
    })

    it('retries unregistering after a delay', async () => {
      givenWallet({ usePushNotifications: false, registered: true })
      mockFunction(unregisterDeviceToken).mockResolvedValueOnce(false)
      renderHook(() => usePushNotifications())
      await waitFor(() => expect(unregisterDeviceToken).toHaveBeenCalledTimes(1))

      await act(async () => jest.advanceTimersByTime(SYNC_RETRY_DELAYS_MS[0]))

      await waitFor(() => expect(unregisterDeviceToken).toHaveBeenCalledTimes(2))
    })

    it('stops retrying after the last delay', async () => {
      givenWallet()
      mockFunction(registerDeviceToken).mockResolvedValue(false)
      renderHook(() => usePushNotifications())

      for (const [attempt, delay] of SYNC_RETRY_DELAYS_MS.entries()) {
        await waitFor(() => expect(registerDeviceToken).toHaveBeenCalledTimes(attempt + 1))
        await act(async () => jest.advanceTimersByTime(delay))
      }
      await waitFor(() => expect(registerDeviceToken).toHaveBeenCalledTimes(SYNC_RETRY_DELAYS_MS.length + 1))
      await act(async () => jest.advanceTimersByTime(Math.max(...SYNC_RETRY_DELAYS_MS)))

      expect(registerDeviceToken).toHaveBeenCalledTimes(SYNC_RETRY_DELAYS_MS.length + 1)
    })

    it('drops a pending retry on unmount', async () => {
      givenWallet()
      mockFunction(registerDeviceToken).mockResolvedValueOnce(false)
      const { unmount } = renderHook(() => usePushNotifications())
      await waitFor(() => expect(registerDeviceToken).toHaveBeenCalledTimes(1))

      unmount()
      await act(async () => jest.advanceTimersByTime(SYNC_RETRY_DELAYS_MS[0]))

      expect(registerDeviceToken).toHaveBeenCalledTimes(1)
    })
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

  it('does nothing when push is not supported (no Firebase config)', () => {
    mockFunction(isPushNotificationsSupported).mockReturnValue(false)
    givenWallet()

    renderHook(() => usePushNotifications())

    expect(hasNotificationPermission).not.toHaveBeenCalled()
    expect(registerDeviceToken).not.toHaveBeenCalled()
  })
})
