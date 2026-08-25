import { useEffect } from 'react'
import { useAuth } from 'react-oidc-context'

import styles from './App.module.scss'
import Button from './components/Button/Button'
import DashboardPage from './pages/DashboardPage'

function App() {
  const auth = useAuth()

  // The login page is Keycloak's: an unauthenticated visit redirects there
  // immediately. The guards prevent redirect loops during the callback
  // exchange and after a failed sign-in.
  const shouldRedirect =
    !auth.isAuthenticated && !auth.isLoading && !auth.activeNavigator && !auth.error

  useEffect(() => {
    if (shouldRedirect) {
      void auth.signinRedirect()
    }
  }, [shouldRedirect, auth])

  // P2.9: presentation only — the auth flow and state switch are unchanged;
  // the "Sign out" button moved out of the dashboard body into the top bar.
  return (
    <div className={styles.app}>
      <header className={styles.topBar}>
        <span className={styles.title}>Heka SSO Web UI</span>
        {auth.isAuthenticated && (
          <Button buttonType="outlined" onPress={() => void auth.signoutRedirect()}>
            Sign out
          </Button>
        )}
      </header>
      <main className={styles.main}>
        {auth.error ? (
          <div className={styles.error}>
            <h1 className={styles.errorTitle}>Sign-in failed</h1>
            <p className={styles.errorMessage}>{auth.error.message}</p>
            <Button onPress={() => void auth.signinRedirect()}>Try again</Button>
          </div>
        ) : auth.isAuthenticated ? (
          <DashboardPage />
        ) : (
          <p className={styles.status}>Signing in…</p>
        )}
      </main>
    </div>
  )
}

export default App
