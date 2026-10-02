import type { ProfileFactory } from './types';

/**
 * Keycloak (26.1+): registration through the standard `prompt=create` parameter
 * (OpenID Connect "Initiating User Registration"), password change through the
 * Application Initiated Action `kc_action=UPDATE_PASSWORD`. Refresh tokens are issued
 * without `offline_access`, which would request long-lived offline tokens instead.
 */
export const keycloakProfile: ProfileFactory = () => ({
  name: 'keycloak',
  defaultScope: 'openid profile',
  authorizeParams: {},
  nameClaims: ['preferred_username', 'name'],
  signUp: (auth) => auth.signinRedirect({ prompt: 'create' }),
  changePassword: (auth) =>
    auth.signinRedirect({ extraQueryParams: { kc_action: 'UPDATE_PASSWORD' } }),
});
