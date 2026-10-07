import { render, screen } from '@testing-library/react';
import { UserManager } from 'oidc-client-ts';
import React from 'react';
import { Provider } from 'react-redux';

import { createTestStore } from '@/shared/lib/tests/renderWithProviders';

import { AuthConfig, authConfig } from './config';
import { OidcAuthProvider, SessionBridge } from './OidcAuthProvider';
import { genericProfile } from './profiles/generic';
import { keycloakProfile } from './profiles/keycloak';
import { AuthSession, useAuthSession } from './session';
import {
  dropSession,
  getSessionAccessToken,
  refreshSessionToken,
  registerSessionBridge,
  signOutSession,
} from './sessionBridge';

// A controllable stand-in for the react-oidc-context state
const mockAuth = {
  user: null as unknown,
  isLoading: false,
  activeNavigator: undefined as string | undefined,
  error: undefined as Error | undefined,
  signinRedirect: jest.fn(),
  signoutRedirect: jest.fn(),
  removeUser: jest.fn(),
};

const mockProviderProps: { onSigninCallback?: () => void } = {};

jest.mock('react-oidc-context', () => ({
  useAuth: () => mockAuth,
  AuthProvider: ({
    children,
    onSigninCallback,
  }: {
    children: React.ReactNode;
    onSigninCallback?: () => void;
  }) => {
    mockProviderProps.onSigninCallback = onSigninCallback;
    return <div data-testid="oidc-provider">{children}</div>;
  },
}));

jest.mock('./config', () => ({
  authConfig: { provider: 'keycloak' },
}));

const activeUser = (accessToken: string, expired = false) => ({
  access_token: accessToken,
  expired,
  profile: { sub: 'u1', preferred_username: 'ada' },
});

const userManager = (signinSilent: jest.Mock = jest.fn()) =>
  ({ signinSilent }) as unknown as UserManager;

let session: AuthSession | undefined;
const Probe = () => {
  session = useAuthSession();
  return null;
};

const renderBridge = (
  profile = keycloakProfile({ provider: 'keycloak' }),
  manager = userManager(),
) => {
  const store = createTestStore();
  const view = render(
    <Provider store={store}>
      <SessionBridge
        profile={profile}
        userManager={manager}
      >
        <Probe />
      </SessionBridge>
    </Provider>,
  );
  return { store, ...view };
};

beforeEach(() => {
  session = undefined;
  Object.assign(mockAuth, {
    user: null,
    isLoading: false,
    activeNavigator: undefined,
    error: undefined,
  });
  mockAuth.signinRedirect.mockResolvedValue(undefined);
  mockAuth.signoutRedirect.mockResolvedValue(undefined);
  mockAuth.removeUser.mockResolvedValue(undefined);
});

afterEach(() => registerSessionBridge(null));

describe('SessionBridge', () => {
  test('mirrors a signed-in user into the store and the session', () => {
    mockAuth.user = activeUser('tok-1');

    const { store } = renderBridge();

    expect(store.getState().user.data).toMatchObject({
      name: 'ada',
      tokens: { accessToken: 'tok-1' },
    });
    expect(session).toMatchObject({
      provider: 'keycloak',
      isAuthenticated: true,
      isLoading: false,
      userName: 'ada',
    });
    expect(getSessionAccessToken()).toBe('tok-1');
  });

  test('treats an expired user as signed out and clears the store', () => {
    mockAuth.user = activeUser('old', true);

    const { store } = renderBridge();

    expect(session?.isAuthenticated).toBe(false);
    expect(session?.userName).toBeNull();
    expect(store.getState().user.data?.tokens).toEqual({ accessToken: null });
    expect(getSessionAccessToken()).toBeNull();
  });

  test('keeps the store untouched while the session is still restored', () => {
    mockAuth.isLoading = true;
    const store = createTestStore({
      user: {
        isLoading: false,
        isPreparing: false,
        data: { tokens: { accessToken: 'persisted' } },
      },
    });

    render(
      <Provider store={store}>
        <SessionBridge
          profile={keycloakProfile({ provider: 'keycloak' })}
          userManager={userManager()}
        >
          <Probe />
        </SessionBridge>
      </Provider>,
    );

    expect(store.getState().user.data?.tokens?.accessToken).toBe('persisted');
    expect(session?.isLoading).toBe(true);
  });

  test('reports a running navigation as loading and exposes the error', () => {
    mockAuth.activeNavigator = 'signinRedirect';
    mockAuth.error = new Error('login_required');

    renderBridge();

    expect(session?.isLoading).toBe(true);
    expect(session?.error).toBe('login_required');
  });

  test('signIn, signUp and changePassword go through the provider profile', async () => {
    renderBridge();

    await session?.signIn();
    await session?.signUp?.();
    await session?.changePassword?.();

    expect(mockAuth.signinRedirect).toHaveBeenNthCalledWith(1);
    expect(mockAuth.signinRedirect).toHaveBeenNthCalledWith(2, {
      prompt: 'create',
    });
    expect(mockAuth.signinRedirect).toHaveBeenNthCalledWith(3, {
      extraQueryParams: { kc_action: 'UPDATE_PASSWORD' },
    });
  });

  test('offers no sign-up or password change when the profile has none', () => {
    renderBridge(genericProfile({ provider: 'generic' }));

    expect(session?.signUp).toBeUndefined();
    expect(session?.changePassword).toBeUndefined();
  });

  test('signOut logs out at the provider, or forgets the user when that fails', async () => {
    renderBridge();

    await session?.signOut();
    expect(mockAuth.signoutRedirect).toHaveBeenCalledTimes(1);
    expect(mockAuth.removeUser).not.toHaveBeenCalled();

    mockAuth.signoutRedirect.mockRejectedValueOnce(new Error('no end_session'));
    await session?.signOut();
    expect(mockAuth.removeUser).toHaveBeenCalledTimes(1);
  });

  test('the registered bridge renews, drops and signs out the session', async () => {
    const signinSilent = jest
      .fn()
      .mockResolvedValueOnce({ access_token: 'renewed' })
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('invalid_grant'));
    renderBridge(undefined, userManager(signinSilent));

    await expect(refreshSessionToken()).resolves.toBe('renewed');
    await expect(refreshSessionToken()).resolves.toBeNull();
    await expect(refreshSessionToken()).resolves.toBeNull();

    await dropSession();
    expect(mockAuth.removeUser).toHaveBeenCalledTimes(1);

    await signOutSession();
    expect(mockAuth.signoutRedirect).toHaveBeenCalledTimes(1);

    mockAuth.signoutRedirect.mockRejectedValueOnce(new Error('offline'));
    await signOutSession();
    expect(mockAuth.removeUser).toHaveBeenCalledTimes(2);
  });

  test('unregisters the bridge on unmount', () => {
    mockAuth.user = activeUser('tok-1');
    const { unmount } = renderBridge();

    unmount();

    expect(getSessionAccessToken()).toBeNull();
  });
});

describe('OidcAuthProvider', () => {
  const config = authConfig as AuthConfig;

  afterEach(() => {
    config.provider = 'keycloak';
    delete config.authority;
    delete config.clientId;
  });

  test('explains an unknown provider name', () => {
    config.provider = 'okta';

    render(<OidcAuthProvider>app</OidcAuthProvider>);

    expect(
      screen.getByText(/Unknown REACT_APP_AUTH_PROVIDER value "okta"/),
    ).toBeInTheDocument();
    expect(screen.queryByText('app')).not.toBeInTheDocument();
  });

  test('explains a missing authority or client id', () => {
    config.authority = 'https://idp.example.com';

    render(<OidcAuthProvider>app</OidcAuthProvider>);

    expect(
      screen.getByText(/REACT_APP_OIDC_AUTHORITY and REACT_APP_OIDC_CLIENT_ID/),
    ).toBeInTheDocument();
  });

  test('renders the app inside the OIDC provider when configured', () => {
    config.authority = 'https://idp.example.com';
    config.clientId = 'web-ui';

    render(
      <Provider store={createTestStore()}>
        <OidcAuthProvider>
          <span>app</span>
        </OidcAuthProvider>
      </Provider>,
    );

    expect(screen.getByTestId('oidc-provider')).toHaveTextContent('app');
  });

  test('drops code and state from the address bar after the sign-in callback', () => {
    config.authority = 'https://idp.example.com';
    config.clientId = 'web-ui';
    window.history.pushState({}, '', '/issue?code=abc&state=xyz');

    render(
      <Provider store={createTestStore()}>
        <OidcAuthProvider>app</OidcAuthProvider>
      </Provider>,
    );
    mockProviderProps.onSigninCallback?.();

    expect(window.location.pathname).toBe('/issue');
    expect(window.location.search).toBe('');
    window.history.pushState({}, '', '/');
  });
});
