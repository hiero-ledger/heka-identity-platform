import { AuthProviderName } from '@/auth/session'
import { AuthLayout } from '@/components/Layout'
import Loader from '@/components/Loader/Loader'
import { copy } from '@/copy'

import styles from './AuthPages.module.scss'

interface SplashPageProps {
  provider: AuthProviderName
}

/** Shown while the session is restored or the IdP redirect is in flight. */
function SplashPage({ provider }: SplashPageProps) {
  return (
    <AuthLayout title={copy.splash.title} illustration="wallet">
      <div className={styles.splash} role="status" aria-live="polite">
        <Loader type="linear" label={copy.splash.title} />
        <p className={styles.status}>{copy.splash.redirecting(copy.providers[provider])}</p>
      </div>
    </AuthLayout>
  )
}

export default SplashPage
