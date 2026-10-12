import type { ProfileFactory } from './types';

/**
 * Keycloak (26.1+): registration through the standard `prompt=create` parameter
 * (OpenID Connect "Initiating User Registration"), password change through the
 * Application Initiated Action `kc_action=UPDATE_PASSWORD`. Refresh tokens are issued
 * without `offline_access`, which would request long-lived offline tokens instead.
 *
 * The `organization` scope (Keycloak Organizations): a user who is a member of several organizations picks one
 * at login, and the token then carries only that one; users without an organization are not asked.
 */
export const keycloakProfile: ProfileFactory = () => ({
  name: 'keycloak',
  defaultScope: 'openid profile organization',
  authorizeParams: {},
  nameClaims: ['preferred_username', 'name'],
  signUp: (auth) => auth.signinRedirect({ prompt: 'create' }),
  changePassword: (auth) =>
    auth.signinRedirect({ extraQueryParams: { kc_action: 'UPDATE_PASSWORD' } }),
});
