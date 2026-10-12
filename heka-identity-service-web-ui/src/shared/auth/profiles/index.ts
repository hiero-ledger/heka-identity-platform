import type { AuthConfig, AuthProviderName } from '../config';
import { auth0Profile } from './auth0';
import { genericProfile } from './generic';
import { keycloakProfile } from './keycloak';
import type { ProfileFactory, ProviderProfile } from './types';

const factories: Record<AuthProviderName, ProfileFactory> = {
  keycloak: keycloakProfile,
  auth0: auth0Profile,
  generic: genericProfile,
};

export const providerNames = Object.keys(factories) as AuthProviderName[];

const isProviderName = (value: string): value is AuthProviderName =>
  (providerNames as string[]).includes(value);

/** Builds the profile selected by `REACT_APP_AUTH_PROVIDER`; `undefined` for an unknown name. */
export const resolveProfile = (
  config: AuthConfig,
): ProviderProfile | undefined =>
  isProviderName(config.provider)
    ? factories[config.provider](config)
    : undefined;

export type { ProfileAuthActions, ProviderProfile } from './types';
