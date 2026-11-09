import { checkNotifications, openSettings, PermissionStatus, requestNotifications } from 'react-native-permissions'

import { mockFunction } from '../../../../jest-helpers/helpers'
import { hasNotificationPermission, pushNotificationsConfig } from '../../../src/utils/push-notifications/config'
import { isPushNotificationsSupported } from '../../../src/utils/push-notifications/registration'

jest.mock('react-native-permissions', () => ({
  checkNotifications: jest.fn(),
  requestNotifications: jest.fn(),
  openSettings: jest.fn(async () => undefined),
}))
jest.mock('../../../src/utils/push-notifications/registration', () => ({
  isPushNotificationsSupported: jest.fn(),
}))

const notificationsResponse = (status: PermissionStatus) => ({ status, settings: {} })

describe('pushNotificationsConfig', () => {
  beforeEach(() => {
    mockFunction(isPushNotificationsSupported).mockReturnValue(true)
  })

  it.each<[PermissionStatus, string]>([
    ['granted', 'granted'],
    ['limited', 'granted'],
    ['blocked', 'denied'],
    ['denied', 'unknown'],
    ['unavailable', 'unknown'],
  ])('reports permission %s as %s before the user is asked', async (permission, expected) => {
    mockFunction(checkNotifications).mockResolvedValue(notificationsResponse(permission))

    await expect(pushNotificationsConfig.status()).resolves.toBe(expected)
  })

  it.each<[PermissionStatus, string]>([
    ['granted', 'granted'],
    ['denied', 'denied'],
    ['blocked', 'denied'],
  ])('reports a permission request answered %s as %s', async (permission, expected) => {
    mockFunction(requestNotifications).mockResolvedValue(notificationsResponse(permission))

    await expect(pushNotificationsConfig.setup()).resolves.toBe(expected)
  })

  it('opens the system notification settings when notifications are blocked', async () => {
    mockFunction(requestNotifications).mockResolvedValue(notificationsResponse('blocked'))

    await pushNotificationsConfig.setup()

    expect(openSettings).toHaveBeenCalledWith('notifications')
  })

  it('does not open the system settings when the user can still be asked', async () => {
    mockFunction(requestNotifications).mockResolvedValue(notificationsResponse('denied'))

    await pushNotificationsConfig.setup()

    expect(openSettings).not.toHaveBeenCalled()
  })

  it('reports unknown and asks for nothing when push is not supported', async () => {
    mockFunction(isPushNotificationsSupported).mockReturnValue(false)

    await expect(pushNotificationsConfig.status()).resolves.toBe('unknown')
    await expect(pushNotificationsConfig.setup()).resolves.toBe('unknown')
    expect(checkNotifications).not.toHaveBeenCalled()
    expect(requestNotifications).not.toHaveBeenCalled()
  })

  it.each<[PermissionStatus, boolean]>([
    ['granted', true],
    ['limited', true],
    ['denied', false],
    ['blocked', false],
  ])('treats an OS permission %s as allowed: %s', async (permission, expected) => {
    mockFunction(checkNotifications).mockResolvedValue(notificationsResponse(permission))

    await expect(hasNotificationPermission()).resolves.toBe(expected)
  })
})
