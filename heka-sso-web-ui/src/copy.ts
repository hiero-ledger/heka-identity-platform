// All user-facing strings (UI-PLAN.md §2.3): English only, no i18n framework.
// Phase B introduces the shell strings; Phase C adds the screens'.
export const copy = {
  app: {
    /** Wordmark next to the logo mark. */
    name: 'Heka',
    /** Document title (index.html) and long-form product name. */
    title: 'Heka demo app',
  },
  nav: {
    dashboard: 'Dashboard',
    signOut: 'Sign out',
  },
  states: {
    signingIn: {
      title: 'Signing you in',
      redirecting: (provider: string) => `Redirecting to ${provider}…`,
    },
    signedOut: {
      title: 'Signed out',
      message: 'You have been signed out.',
      action: 'Sign in',
    },
    error: {
      title: 'Sign-in failed',
      action: 'Try again',
    },
  },
  providers: {
    keycloak: 'Keycloak',
    auth0: 'Auth0',
  },
} as const
