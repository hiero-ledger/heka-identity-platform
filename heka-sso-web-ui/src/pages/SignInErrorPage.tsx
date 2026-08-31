import Button from '@/components/Button/Button'
import Card from '@/components/Card/Card'
import { AuthLayout } from '@/components/Layout'
import { copy } from '@/copy'

import styles from './AuthPages.module.scss'

interface SignInErrorPageProps {
  message?: string
  onRetry: () => void
  onBack: () => void
}

/** Sign-in failure: error card with a notification-colored accent, retry + back. */
function SignInErrorPage({ message, onRetry, onBack }: SignInErrorPageProps) {
  return (
    <AuthLayout title={copy.error.title} illustration="wallet">
      <div className={styles.action}>
        <Card className={styles.errorCard}>
          <p className={styles.errorHeading} role="alert">
            {copy.error.heading}
          </p>
          <p className={styles.message}>{message || copy.error.fallbackMessage}</p>
          <div className={styles.actions}>
            <Button onPress={onRetry} autoFocus>
              {copy.error.retry}
            </Button>
            <Button buttonType="text" leftIcon="arrow-back" onPress={onBack}>
              {copy.common.back}
            </Button>
          </div>
        </Card>
      </div>
    </AuthLayout>
  )
}

export default SignInErrorPage
