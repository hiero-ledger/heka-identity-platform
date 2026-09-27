import { AuthProviderName } from '@/auth/session'
import Button from '@/components/Button/Button'
import { AuthLayout } from '@/components/Layout'
import { copy } from '@/copy'

import styles from './AuthPages.module.scss'

interface WelcomePageProps {
  provider: AuthProviderName
  signedOut?: boolean
  onSignIn: () => void
}

function WelcomePage({ provider, signedOut, onSignIn }: WelcomePageProps) {
  return (
    <AuthLayout title={copy.welcome.title}>
      <div className={styles.action}>
        <div className={styles.intro}>
          <h2 className={styles.heading}>{signedOut ? copy.welcome.signedOutHeading : copy.welcome.heading}</h2>
          <p className={styles.lead}>{signedOut ? copy.welcome.signedOutLead : copy.welcome.lead}</p>
        </div>
        <Button fullWidth onPress={onSignIn} autoFocus>
          {copy.welcome.signIn}
        </Button>
        <div className={styles.divider} role="separator" />
        <p className={styles.hint}>{copy.welcome.via(copy.providers[provider])}</p>
      </div>
    </AuthLayout>
  )
}

export default WelcomePage
