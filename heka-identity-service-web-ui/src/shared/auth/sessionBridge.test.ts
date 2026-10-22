import {
  dropSession,
  getSessionAccessToken,
  refreshSessionToken,
  registerSessionBridge,
  renewSessionToken,
  signOutSession,
} from './sessionBridge';

describe('session bridge', () => {
  afterEach(() => registerSessionBridge(null));

  test('is inert until a provider registers', async () => {
    expect(getSessionAccessToken()).toBeNull();
    await expect(refreshSessionToken()).resolves.toBeNull();
    await expect(dropSession()).resolves.toBeUndefined();
    await expect(signOutSession()).resolves.toBeUndefined();
  });

  test('delegates to the registered implementation', async () => {
    const implementation = {
      getAccessToken: jest.fn().mockReturnValue('token-1'),
      refresh: jest.fn().mockResolvedValue('token-2'),
      dropSession: jest.fn().mockResolvedValue(undefined),
      signOut: jest.fn().mockResolvedValue(undefined),
    };
    registerSessionBridge(implementation);

    expect(getSessionAccessToken()).toBe('token-1');
    await expect(refreshSessionToken()).resolves.toBe('token-2');
    await dropSession();
    await signOutSession();
    expect(implementation.dropSession).toHaveBeenCalled();
    expect(implementation.signOut).toHaveBeenCalled();
  });

  describe('renewSessionToken', () => {
    const makeImplementation = (token: string) => {
      let current = token;
      return {
        getAccessToken: jest.fn(() => current),
        refresh: jest.fn(async () => {
          current = `${current}-renewed`;
          return current;
        }),
        dropSession: jest.fn().mockResolvedValue(undefined),
        signOut: jest.fn().mockResolvedValue(undefined),
      };
    };

    test('refreshes when the session still holds the rejected token', async () => {
      const implementation = makeImplementation('token-1');
      registerSessionBridge(implementation);

      await expect(renewSessionToken('token-1')).resolves.toBe(
        'token-1-renewed',
      );
      expect(implementation.refresh).toHaveBeenCalledTimes(1);
    });

    test('reuses a token renewed since the rejected one was sent', async () => {
      const implementation = makeImplementation('token-2');
      registerSessionBridge(implementation);

      await expect(renewSessionToken('token-1')).resolves.toBe('token-2');
      expect(implementation.refresh).not.toHaveBeenCalled();
    });

    test('concurrent callers with the same rejected token share one refresh', async () => {
      const implementation = makeImplementation('token-1');
      registerSessionBridge(implementation);

      const tokens = await Promise.all([
        renewSessionToken('token-1'),
        renewSessionToken('token-1'),
      ]);

      expect(tokens).toEqual(['token-1-renewed', 'token-1-renewed']);
      expect(implementation.refresh).toHaveBeenCalledTimes(1);
    });

    test('resolves to null without a session', async () => {
      await expect(renewSessionToken('token-1')).resolves.toBeNull();
    });
  });
});
