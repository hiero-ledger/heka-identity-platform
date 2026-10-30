import { useStore } from '@bifold/core'
import { getMessaging, onTokenRefresh } from '@react-native-firebase/messaging'
import { useEffect } from 'react'

import { useHekaAgent } from '../agent'

import { hasNotificationPermission } from './config'
import {
  isDeviceTokenRegistered,
  isPushNotificationsSupported,
  registerDeviceToken,
  unregisterDeviceToken,
} from './registration'

// A send cannot be cancelled once it is on its way to the mediator, so sends run one at a time: the next one
// reads the registered flag only after the previous one has written it, and the mediator gets them in order.
let lastSend: Promise<unknown> = Promise.resolve()

// Waits before each retry of a sync the mediator did not accept (e.g. unreachable); then the next agent start retries
export const SYNC_RETRY_DELAYS_MS = [5_000, 30_000, 120_000]

function afterLastSend<T>(send: () => Promise<T>): Promise<T> {
  const next = lastSend.then(send)
  // The caller handles the failure; the queue only waits for it
  lastSend = Promise.allSettled([next])
  return next
}

/**
 * Keeps the mediator's copy of the FCM token in line with the stored push setting whenever a ready agent
 * appears (app start, a fresh agent after lockout) or the setting changes:
 * - push on and notifications allowed by the OS → register, and again when FCM rotates the token;
 * - otherwise, if the mediator may still hold the token → unregister.
 * A failed sync is retried after each of SYNC_RETRY_DELAYS_MS, then on the next agent start.
 * A send still waiting when the setting or the agent changes is cancelled; one already sent finishes first.
 */
export function usePushNotifications(): void {
  const { agent } = useHekaAgent()
  const [store] = useStore()
  const usePush = store.preferences.usePushNotifications
  const authenticated = store.authentication.didAuthenticate
  const agentReady = !!agent?.isInitialized

  useEffect(() => {
    if (!agent || !agentReady || !authenticated || !isPushNotificationsSupported()) return

    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    const shouldSend = () => !cancelled

    // Returns whether the mediator is in line with the setting
    const sync = async (): Promise<boolean> => {
      const wantPush = usePush && (await hasNotificationPermission())
      if (cancelled) return true

      return afterLastSend(async () => {
        if (cancelled) return true
        if (wantPush) return registerDeviceToken(agent, undefined, shouldSend)
        if (await isDeviceTokenRegistered()) return unregisterDeviceToken(agent, shouldSend)
        return true
      })
    }

    const syncWithRetry = (attempt: number): void => {
      sync()
        .then((synced) => {
          const delay = SYNC_RETRY_DELAYS_MS[attempt]
          if (synced || cancelled || delay === undefined) return
          retryTimer = setTimeout(() => syncWithRetry(attempt + 1), delay)
        })
        .catch((error: unknown) => {
          agent.config.logger.error(`Push notifications: syncing the device token failed: ${String(error)}`)
        })
    }
    syncWithRetry(0)

    const unsubscribe = usePush
      ? onTokenRefresh(getMessaging(), (token) => {
          hasNotificationPermission()
            .then((allowed) => (allowed ? afterLastSend(() => registerDeviceToken(agent, token, shouldSend)) : false))
            .catch((error: unknown) => {
              agent.config.logger.error(`Push notifications: token refresh failed: ${String(error)}`)
            })
        })
      : undefined

    return () => {
      cancelled = true
      clearTimeout(retryTimer)
      unsubscribe?.()
    }
  }, [agent, agentReady, authenticated, usePush])
}
