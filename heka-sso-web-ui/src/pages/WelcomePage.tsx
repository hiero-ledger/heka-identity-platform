import { AuthProviderName } from '@/auth/session'
import Button from '@/components/Button/Button'
import { AuthLayout } from '@/components/Layout'
import { copy } from '@/copy'

import styles from './AuthPages.module.scss'

interface WelcomePageProps {
  provider: AuthProviderName
  /** After an explicit sign-out the copy reads as an end state. */
  signedOut?: boolean
  onSignIn: () => void
}

/**
 * The signed-out landing (and, with auto sign-in off, the first screen):
 * Figma "Sign in" minus the password fields — heading, one-line pitch, the
 * primary "Sign in with wallet" action, divider, provider line.
 */
function WelcomePage({ provider, signedOut, onSignIn }: WelcomePageProps) {
  return (
    <AuthLayout title={copy.welcome.title} illustration="wallet">
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
