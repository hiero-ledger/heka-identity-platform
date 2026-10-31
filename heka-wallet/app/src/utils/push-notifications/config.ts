import { checkNotifications, openSettings, PermissionStatus, requestNotifications } from 'react-native-permissions'

import { isPushNotificationsSupported } from './registration'

type BifoldPushStatus = 'denied' | 'granted' | 'unknown'

// On Android 13+ react-native-permissions reports `denied` while the user has not been asked yet
// and `blocked` once they refused; before a request `denied` therefore means "not decided".
function toBifoldStatus(status: PermissionStatus, notAskedYet: BifoldPushStatus): BifoldPushStatus {
  switch (status) {
    case 'granted':
    case 'limited':
      return 'granted'
    case 'blocked':
      return 'denied'
    case 'denied':
      return notAskedYet
    default:
      return 'unknown'
  }
}

export async function hasNotificationPermission(): Promise<boolean> {
  const { status } = await checkNotifications()
  return toBifoldStatus(status, 'unknown') === 'granted'
}

/**
 * Bifold `enablePushNotifications` contract: drives the Settings > Notifications toggle
 * (`TogglePushNotifications`), which stores `preferences.usePushNotifications`.
 */
export const pushNotificationsConfig = {
  status: async (): Promise<BifoldPushStatus> => {
    if (!isPushNotificationsSupported()) return 'unknown'
    const { status } = await checkNotifications()
    return toBifoldStatus(status, 'unknown')
  },
  setup: async (): Promise<BifoldPushStatus> => {
    if (!isPushNotificationsSupported()) return 'unknown'
    const { status } = await requestNotifications()
    // Android shows no prompt once notifications are blocked, and Bifold's "Open settings" button never
    // appears here (it needs the suppressed onboarding step) — so take the user to the system settings.
    if (status === 'blocked') await openSettings('notifications')
    return toBifoldStatus(status, 'denied')
  },
  // Registering and unregistering both follow the stored `usePushNotifications` in usePushNotifications,
  // which can cancel a stale send and retry a failed unregister; doing it here too raced with the hook.
  toggle: async (): Promise<void> => undefined,
}
