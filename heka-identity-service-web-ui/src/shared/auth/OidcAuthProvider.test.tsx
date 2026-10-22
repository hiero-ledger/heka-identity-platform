import { act, render, waitFor } from '@testing-library/react';
import {
  IdTokenClaims,
  InMemoryWebStorage,
  User,
  UserManager,
  WebStorageStateStore,
} from 'oidc-client-ts';
import { AuthProvider } from 'react-oidc-context';

import { SessionBridge } from './OidcAuthProvider';
import { genericProfile } from './profiles/generic';
import { useAuthSession } from './session';
import { getSessionAccessToken, refreshSessionToken } from './sessionBridge';

jest.mock('@/shared/lib/hooks/useAppDispatch', () => ({
  useAppDispatch: () => jest.fn(),
}));

const buildUser = (accessToken: string) =>
  new User({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    profile: { sub: 'user-1', name: 'Test User' } as IdTokenClaims,
  });

describe('SessionBridge', () => {
  test('renewing the session keeps the app mounted', async () => {
    const userManager = new UserManager({
      authority: 'https://idp.example.com',
      client_id: 'web-ui',
      redirect_uri: 'http://localhost/',
      userStore: new WebStorageStateStore({ store: new InMemoryWebStorage() }),
    });
    await userManager.storeUser(buildUser('token-1'));

    // Hold the renewal open so the in-flight state gets rendered and can be inspected
    let finishRenewal: () => void = () => {};
    const renewalReleased = new Promise<void>((resolve) => {
      finishRenewal = resolve;
    });
    jest.spyOn(userManager, 'signinSilent').mockImplementation(async () => {
      await renewalReleased;
      const renewed = buildUser('token-2');
      await userManager.storeUser(renewed);
      await userManager.events.load(renewed);
      return renewed;
    });

    let isLoading: boolean | undefined;
    const Probe = () => {
      isLoading = useAuthSession().isLoading;
      return null;
    };

    render(
      <AuthProvider userManager={userManager}>
        <SessionBridge
          profile={genericProfile({ provider: 'generic' })}
          userManager={userManager}
        >
          <Probe />
        </SessionBridge>
      </AuthProvider>,
    );

    await waitFor(() => expect(getSessionAccessToken()).toBe('token-1'));
    expect(isLoading).toBe(false);

    let refresh: Promise<string | null> = Promise.resolve(null);
    await act(async () => {
      refresh = refreshSessionToken();
    });
    // While the renewal is in flight the router must stay mounted
    expect(isLoading).toBe(false);

    let renewedToken: string | null = null;
    let tokenBeforeRerender: string | null = null;
    await act(async () => {
      finishRenewal();
      renewedToken = await refresh;
      // Read before act flushes the re-render: requests queued behind this renewal must
      // already see the new token, or they would renew again
      tokenBeforeRerender = getSessionAccessToken();
    });

    expect(renewedToken).toBe('token-2');
    expect(tokenBeforeRerender).toBe('token-2');
    expect(getSessionAccessToken()).toBe('token-2');
    expect(isLoading).toBe(false);
  });
});
