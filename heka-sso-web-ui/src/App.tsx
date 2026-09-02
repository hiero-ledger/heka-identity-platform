import { useEffect, useState } from 'react'

import styles from './App.module.scss'
import { useAuthSession } from './auth/session'
import Button from './components/Button/Button'
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

  // presentation only — the auth flow and state switch are unchanged;
  // the "Sign out" button moved out of the dashboard body into the top bar.
  return (
    <div className={styles.app}>
      <header className={styles.topBar}>
        <span className={styles.title}>Heka SSO Web UI</span>
        {auth.isAuthenticated && (
          <Button buttonType="outlined" onPress={signOut}>
            Sign out
          </Button>
        )}
      </header>
      <main className={styles.main}>
        {auth.error ? (
          <div className={styles.error}>
            <h1 className={styles.errorTitle}>Sign-in failed</h1>
            <p className={styles.errorMessage}>{auth.error}</p>
            <Button onPress={() => auth.signIn()}>Try again</Button>
          </div>
        ) : auth.isAuthenticated ? (
          <DashboardPage />
        ) : signedOut && !auth.isLoading ? (
          // Reuses the error card's layout for the signed-out landing.
          <div className={styles.error}>
            <h1 className={styles.errorTitle}>Signed out</h1>
            <p className={styles.errorMessage}>You have been signed out.</p>
            <Button onPress={signInAgain}>Sign in</Button>
          </div>
        ) : (
          <p className={styles.status}>Signing in…</p>
        )}
      </main>
    </div>
  )
}

export default App
