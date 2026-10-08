import type { ProfileFactory } from './types';

/**
 * Auth0: the API identifier must be sent as `audience`, otherwise the access token is opaque
 * and heka-identity-service cannot verify it; `offline_access` is required for refresh tokens;
 * Universal Login opens on the sign-up screen with `screen_hint=signup`. There is no in-flow
 * password change, so the profile only offers one when an account page is configured.
 */
export const auth0Profile: ProfileFactory = (config) => {
  const authorizeParams: Record<string, string> = {};
  if (config.audience) {
    authorizeParams.audience = config.audience;
  }
  // Auth0 Organizations: the login goes through this organization, so the token carries its org_id and the roles
  // of that membership (see heka-sso-service/auth0/actions/post-login.js).
  if (config.organization) {
    authorizeParams.organization = config.organization;
  }

  return {
    name: 'auth0',
    defaultScope: 'openid profile offline_access',
    authorizeParams,
    nameClaims: ['nickname', 'name', 'email'],
    signUp: (auth) =>
      auth.signinRedirect({ extraQueryParams: { screen_hint: 'signup' } }),
    changePassword: config.accountUrl
      ? () => {
          window.location.assign(config.accountUrl as string);
          return Promise.resolve();
        }
      : undefined,
  };
};
