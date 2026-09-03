import { AuthProviderName } from '@/auth/session'
import { AuthLayout } from '@/components/Layout'
import Loader from '@/components/Loader/Loader'
import { copy } from '@/copy'

import styles from './AuthPages.module.scss'

interface SplashPageProps {
  provider: AuthProviderName
  /** `in` while a session is restored or the IdP redirect is in flight; `out` while the logout redirect leaves. */
  direction?: 'in' | 'out'
}

/** Transitional screen — stays on screen until the browser navigates away, so nothing else flashes. */
function SplashPage({ provider, direction = 'in' }: SplashPageProps) {
  const providerLabel = copy.providers[provider]
  const title = direction === 'out' ? copy.splash.signingOutTitle : copy.splash.title
  const status = direction === 'out' ? copy.splash.signingOut(providerLabel) : copy.splash.redirecting(providerLabel)
  return (
    <AuthLayout title={title}>
      <div className={styles.splash} role="status" aria-live="polite">
        <Loader type="linear" label={title} />
        <p className={styles.status}>{status}</p>
      </div>
    </AuthLayout>
  )
}

export default SplashPage
