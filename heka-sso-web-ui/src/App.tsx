import { useEffect, useState } from 'react'

import styles from './App.module.scss'
import { useAuthSession } from './auth/session'
import { displayName } from './claims'
import Button from './components/Button/Button'
import Card from './components/Card/Card'
import { AppLayout, AuthLayout } from './components/Layout'
import Loader from './components/Loader/Loader'
import { copy } from './copy'
import DashboardPage from './pages/DashboardPage'

// Survives the logout redirect round-trip (per tab): with it set, the app
// shows the signed-out landing instead of auto-redirecting straight back
// into the IdP — which still holds a session and would silently sign the
// user in again.
const SIGNED_OUT_KEY = 'heka-sso-web-ui.signed-out'

function App() {
  const auth = useAuthSession()
  const [signedOut, setSignedOut] = useState(() => sessionStorage.getItem(SIGNED_OUT_KEY) === '1')

  // The login page is the IdP's (Keycloak or Auth0): an unauthenticated visit
  // redirects there immediately. The guards prevent redirect loops during the
  // callback exchange, after a failed sign-in, and after an explicit sign-out.
  const shouldRedirect = !signedOut && !auth.isAuthenticated && !auth.isLoading && !auth.error

  useEffect(() => {
    if (shouldRedirect) {
      auth.signIn()
    }
  }, [shouldRedirect, auth])

  const signOut = () => {
    sessionStorage.setItem(SIGNED_OUT_KEY, '1')
    setSignedOut(true)
    auth.signOut()
  }

  const signInAgain = () => {
    sessionStorage.removeItem(SIGNED_OUT_KEY)
    setSignedOut(false)
    auth.signIn()
  }

  // Presentation only: the auth flow and the state switch are
  // unchanged; the states render inside the shells from components/Layout.
  // Phase C replaces the interim cards below with the Welcome / Splash /
  // Sign-in-failed screens.
  if (auth.isAuthenticated) {
    return (
      <AppLayout userName={displayName(auth.claims)} onSignOut={signOut}>
        <DashboardPage />
      </AppLayout>
    )
  }

  if (auth.error) {
    return (
      <AuthLayout title={copy.states.error.title} illustration="wallet">
        <Card>
          <p className={styles.message}>{auth.error}</p>
          <div className={styles.actions}>
            <Button onPress={() => auth.signIn()}>{copy.states.error.action}</Button>
          </div>
        </Card>
      </AuthLayout>
    )
  }

  if (signedOut && !auth.isLoading) {
    return (
      <AuthLayout title={copy.states.signedOut.title} illustration="wallet">
        <Card>
          <p className={styles.message}>{copy.states.signedOut.message}</p>
          <div className={styles.actions}>
            <Button onPress={signInAgain}>{copy.states.signedOut.action}</Button>
          </div>
        </Card>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title={copy.states.signingIn.title} illustration="wallet">
      <div className={styles.splash}>
        <Loader type="linear" label={copy.states.signingIn.title} />
        <p className={styles.status}>{copy.states.signingIn.redirecting(copy.providers[auth.provider])}</p>
      </div>
    </AuthLayout>
  )
}

export default App
