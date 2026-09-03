import { AuthProviderName } from '@/auth/session'
import { AuthLayout } from '@/components/Layout'
import Loader from '@/components/Loader/Loader'
import { copy } from '@/copy'

import styles from './AuthPages.module.scss'

interface SplashPageProps {
  provider: AuthProviderName
  direction?: 'in' | 'out'
}

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
