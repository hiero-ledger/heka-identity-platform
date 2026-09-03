export const copy = {
  app: {
    name: 'CivicTrust',
    title: 'CivicTrust Demo',
  },
  common: {
    back: 'Back',
    notShared: 'Not shared',
    none: '—',
  },
  providers: {
    keycloak: 'Keycloak',
    auth0: 'Auth0',
  },
  nav: {
    dashboard: 'Dashboard',
    signOut: 'Sign out',
  },
  eyebrow: {
    dashboard: 'Your account',
    auth: 'CivicTrust Demo',
  },
  splash: {
    title: 'Signing you in',
    redirecting: (provider: string) => `Redirecting to ${provider}…`,
    signingOutTitle: 'Signing you out',
    signingOut: (provider: string) => `Ending your session at ${provider}…`,
  },
  welcome: {
    title: 'Sign in',
    heading: 'Sign in to CivicTrust Demo',
    lead: 'Use a verifiable credential from your wallet — no password needed.',
    signedOutHeading: 'You’re signed out',
    signedOutLead: 'Sign in again with your wallet whenever you’re ready.',
    signIn: 'Sign in with wallet',
    via: (provider: string) => `Authentication via ${provider}`,
  },
  error: {
    title: 'Sign-in failed',
    heading: 'We couldn’t sign you in',
    fallbackMessage: 'The identity provider returned an error.',
    retry: 'Try again',
  },
  dashboard: {
    greeting: (firstName?: string) => (firstName ? `Welcome, ${firstName}` : 'Welcome'),
    signedInWithWallet: (provider: string) => `Signed in with your wallet via ${provider}.`,
    signedInVia: (provider: string) => `Signed in via ${provider}.`,
    identity: {
      title: 'Your identity',
      givenName: 'Given name',
      familyName: 'Family name',
      email: 'Email',
      age: 'Age',
      verifiedAdult: 'Verified 18+',
      notVerifiedAdult: 'Not verified 18+',
    },
    developer: {
      summary: 'Raw ID token claims',
    },
  },
} as const
