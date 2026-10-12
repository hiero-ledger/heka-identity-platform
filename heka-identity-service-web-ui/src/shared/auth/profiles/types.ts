import type { SigninRedirectArgs } from 'oidc-client-ts';

import type { AuthConfig, AuthProviderName } from '../config';

/** The subset of the OIDC client a profile needs to start a provider-hosted flow. */
export interface ProfileAuthActions {
  signinRedirect(args?: SigninRedirectArgs): Promise<void>;
}

/**
 * Everything that differs between OIDC providers. The OIDC core (discovery, PKCE, refresh,
 * logout) is shared; a profile only contributes the provider's quirks.
 */
export interface ProviderProfile {
  name: AuthProviderName;
  /** Scope requested when `REACT_APP_OIDC_SCOPE` is unset. */
  defaultScope: string;
  /** Extra authorize-request parameters, e.g. Auth0's `audience`. */
  authorizeParams: Record<string, string>;
  /** Ordered claims tried for the display name. */
  nameClaims: string[];
  /** Starts the provider's self-registration flow; absent when the provider has none. */
  signUp?: (auth: ProfileAuthActions) => Promise<void>;
  /** Starts the provider's password change; absent when the provider has no reachable flow. */
  changePassword?: (auth: ProfileAuthActions) => Promise<void>;
}

export type ProfileFactory = (config: AuthConfig) => ProviderProfile;
