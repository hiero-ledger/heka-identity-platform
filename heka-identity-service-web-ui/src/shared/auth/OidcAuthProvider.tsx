import { User, UserManager, WebStorageStateStore } from 'oidc-client-ts';
import React, { PropsWithChildren, useEffect, useMemo, useRef } from 'react';
import { AuthProvider, useAuth } from 'react-oidc-context';

import { userActions } from '@/entities/User';
import { useAppDispatch } from '@/shared/lib/hooks/useAppDispatch';

import { pickDisplayName } from './claims';
import { AuthConfig, authConfig } from './config';
import { providerNames, ProviderProfile, resolveProfile } from './profiles';
import { AuthSession, AuthSessionContext } from './session';
import { registerSessionBridge } from './sessionBridge';

const buildUserManager = (config: AuthConfig, profile: ProviderProfile) =>
  new UserManager({
    authority: config.authority as string,
    client_id: config.clientId as string,
    redirect_uri: `${window.location.origin}/`,
    post_logout_redirect_uri: `${window.location.origin}/`,
    response_type: 'code',
    scope: config.scope ?? profile.defaultScope,
    extraQueryParams: profile.authorizeParams,
    // Renew with the refresh token in the background instead of hidden iframes.
    automaticSilentRenew: true,
    loadUserInfo: false,
    monitorSession: false,
    userStore: new WebStorageStateStore({ store: window.sessionStorage }),
  });

/** Drops `code`/`state` from the address bar once the redirect callback has been processed. */
const onSigninCallback = () => {
  window.history.replaceState({}, document.title, window.location.pathname);
};

const activeUser = (user: User | null | undefined): User | null =>
  user && !user.expired ? user : null;

interface SessionBridgeProps {
  profile: ProviderProfile;
}

/** Mirrors the OIDC client state into the Redux user slice and exposes the `AuthSession` contract. */
const SessionBridge = ({
  profile,
  children,
}: PropsWithChildren<SessionBridgeProps>) => {
  const auth = useAuth();
  const dispatch = useAppDispatch();
  const user = activeUser(auth.user);
  const userRef = useRef<User | null>(user);
  userRef.current = user;

  useEffect(() => {
    if (user) {
      dispatch(
        userActions.setSession({
          accessToken: user.access_token,
          name: pickDisplayName(user.profile, profile.nameClaims),
        }),
      );
    } else if (!auth.isLoading) {
      dispatch(userActions.clearSession());
    }
  }, [user, auth.isLoading, dispatch, profile]);

  useEffect(() => {
    registerSessionBridge({
      getAccessToken: () => userRef.current?.access_token ?? null,
      refresh: async () => {
        try {
          const renewed = await auth.signinSilent();
          return renewed?.access_token ?? null;
        } catch {
          return null;
        }
      },
      dropSession: () => auth.removeUser(),
      signOut: async () => {
        try {
          await auth.signoutRedirect();
        } catch {
          await auth.removeUser();
        }
      },
    });
    return () => registerSessionBridge(null);
  }, [auth]);

  const session = useMemo<AuthSession>(
    () => ({
      provider: profile.name,
      isAuthenticated: user !== null,
      isLoading: auth.isLoading || Boolean(auth.activeNavigator),
      error: auth.error?.message,
      userName: user ? pickDisplayName(user.profile, profile.nameClaims) : null,
      signIn: () => auth.signinRedirect(),
      signUp: profile.signUp ? () => profile.signUp!(auth) : undefined,
      changePassword: profile.changePassword
        ? () => profile.changePassword!(auth)
        : undefined,
      signOut: async () => {
        try {
          await auth.signoutRedirect();
        } catch {
          await auth.removeUser();
        }
      },
    }),
    [auth, user, profile],
  );

  return (
    <AuthSessionContext.Provider value={session}>
      {children}
    </AuthSessionContext.Provider>
  );
};

const ConfigError = ({ message }: { message: string }) => (
  <p style={{ padding: 24 }}>{message}</p>
);

/**
 * Authenticates the app against the OpenID Connect provider configured with
 * `REACT_APP_OIDC_*` (Authorization Code + PKCE), with provider quirks taken from the
 * profile selected by `REACT_APP_AUTH_PROVIDER`.
 */
export const OidcAuthProvider = ({ children }: PropsWithChildren) => {
  const profile = useMemo(() => resolveProfile(authConfig), []);
  const userManager = useMemo(
    () =>
      profile && authConfig.authority && authConfig.clientId
        ? buildUserManager(authConfig, profile)
        : undefined,
    [profile],
  );

  if (!profile) {
    return (
      <ConfigError
        message={`Unknown REACT_APP_AUTH_PROVIDER value "${authConfig.provider}"; expected one of ${providerNames.join(', ')}.`}
      />
    );
  }
  if (!userManager) {
    return (
      <ConfigError message="REACT_APP_OIDC_AUTHORITY and REACT_APP_OIDC_CLIENT_ID must be set to the OpenID Connect provider and the web UI client." />
    );
  }

  return (
    <AuthProvider
      userManager={userManager}
      onSigninCallback={onSigninCallback}
    >
      <SessionBridge profile={profile}>{children}</SessionBridge>
    </AuthProvider>
  );
};
