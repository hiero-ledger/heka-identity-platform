/**
 * OpenID Connect settings, read by webpack at build time (dotenv-webpack replaces each
 * `process.env.REACT_APP_*` expression, so every variable is referenced explicitly).
 */
export type AuthProviderName = 'keycloak' | 'auth0' | 'generic';

export interface AuthConfig {
  /** Selects the provider profile (sign-up entry, password change, extra authorize params). */
  provider: string;
  /** Issuer URL: the OIDC discovery base, e.g. `http://localhost:8080/realms/heka-platform` or `https://<tenant>.auth0.com/`. */
  authority?: string;
  /** Public (PKCE) client id registered for this web UI. */
  clientId?: string;
  /** Requested scope; defaults to the profile's scope. */
  scope?: string;
  /** API identifier sent as `audience` (Auth0); ignored by profiles that do not need it. */
  audience?: string;
  /** Account page for profiles without an in-flow password change. */
  accountUrl?: string;
}

const text = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

export const authConfig: AuthConfig = {
  provider: (
    text(process.env.REACT_APP_AUTH_PROVIDER) ?? 'keycloak'
  ).toLowerCase(),
  authority: text(process.env.REACT_APP_OIDC_AUTHORITY),
  clientId: text(process.env.REACT_APP_OIDC_CLIENT_ID),
  scope: text(process.env.REACT_APP_OIDC_SCOPE),
  audience: text(process.env.REACT_APP_OIDC_AUDIENCE),
  accountUrl: text(process.env.REACT_APP_AUTH_ACCOUNT_URL),
};
