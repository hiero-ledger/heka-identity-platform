import type { AuthConfig } from '../config';
import type { ProfileAuthActions } from './types';

import { providerNames, resolveProfile } from './index';

const baseConfig: AuthConfig = {
  provider: 'keycloak',
  authority: 'http://localhost:8080/realms/heka-platform',
  clientId: 'heka-identity-web-ui',
};

const makeAuth = (): ProfileAuthActions & { signinRedirect: jest.Mock } => ({
  signinRedirect: jest.fn().mockResolvedValue(undefined),
});

describe('provider profiles', () => {
  test('lists the supported providers', () => {
    expect(providerNames).toEqual(['keycloak', 'auth0', 'generic']);
  });

  test('resolves undefined for an unknown provider name', () => {
    expect(resolveProfile({ ...baseConfig, provider: 'okta' })).toBeUndefined();
  });

  describe('keycloak', () => {
    const profile = resolveProfile(baseConfig)!;

    test('uses plain OIDC scopes and no extra authorize params', () => {
      expect(profile.name).toBe('keycloak');
      expect(profile.defaultScope).toBe('openid profile');
      expect(profile.authorizeParams).toEqual({});
      expect(profile.nameClaims).toEqual(['preferred_username', 'name']);
    });

    test('signs up through prompt=create', async () => {
      const auth = makeAuth();
      await profile.signUp!(auth);
      expect(auth.signinRedirect).toHaveBeenCalledWith({ prompt: 'create' });
    });

    test('changes the password through the UPDATE_PASSWORD application-initiated action', async () => {
      const auth = makeAuth();
      await profile.changePassword!(auth);
      expect(auth.signinRedirect).toHaveBeenCalledWith({
        extraQueryParams: { kc_action: 'UPDATE_PASSWORD' },
      });
    });
  });

  describe('auth0', () => {
    const config: AuthConfig = {
      ...baseConfig,
      provider: 'auth0',
      authority: 'https://heka.eu.auth0.com/',
      audience: 'https://heka-identity',
    };

    test('requests offline_access and sends the API audience', () => {
      const profile = resolveProfile(config)!;
      expect(profile.name).toBe('auth0');
      expect(profile.defaultScope).toBe('openid profile offline_access');
      expect(profile.authorizeParams).toEqual({
        audience: 'https://heka-identity',
      });
      expect(profile.nameClaims).toEqual(['nickname', 'name', 'email']);
    });

    test('sends no audience when none is configured', () => {
      expect(
        resolveProfile({ ...config, audience: undefined })!.authorizeParams,
      ).toEqual({});
    });

    test('signs up through screen_hint=signup', async () => {
      const auth = makeAuth();
      await resolveProfile(config)!.signUp!(auth);
      expect(auth.signinRedirect).toHaveBeenCalledWith({
        extraQueryParams: { screen_hint: 'signup' },
      });
    });

    test('offers a password change only when an account page is configured', async () => {
      expect(resolveProfile(config)!.changePassword).toBeUndefined();

      const assign = jest.fn();
      Object.defineProperty(window, 'location', {
        value: { ...window.location, assign },
        writable: true,
        configurable: true,
      });
      const withAccount = resolveProfile({
        ...config,
        accountUrl: 'https://heka.eu.auth0.com/account',
      })!;
      await withAccount.changePassword!(makeAuth());
      expect(assign).toHaveBeenCalledWith('https://heka.eu.auth0.com/account');
    });
  });

  describe('generic', () => {
    test('has no sign-up and only an account-page password change', () => {
      const profile = resolveProfile({ ...baseConfig, provider: 'generic' })!;
      expect(profile.name).toBe('generic');
      expect(profile.signUp).toBeUndefined();
      expect(profile.changePassword).toBeUndefined();
      expect(profile.defaultScope).toBe('openid profile offline_access');

      const withAccount = resolveProfile({
        ...baseConfig,
        provider: 'generic',
        accountUrl: 'https://idp.example/account',
      })!;
      expect(withAccount.changePassword).toBeDefined();
    });
  });
});
