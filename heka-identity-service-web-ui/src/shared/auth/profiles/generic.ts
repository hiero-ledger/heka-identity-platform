import type { ProfileFactory } from './types';

/**
 * Any other OpenID Connect provider with discovery, Authorization Code + PKCE and refresh
 * tokens. Sign-up is not offered; password change only through a configured account page.
 */
export const genericProfile: ProfileFactory = (config) => ({
  name: 'generic',
  defaultScope: 'openid profile offline_access',
  authorizeParams: {},
  nameClaims: ['preferred_username', 'name', 'email'],
  changePassword: config.accountUrl
    ? () => {
        window.location.assign(config.accountUrl as string);
        return Promise.resolve();
      }
    : undefined,
});
