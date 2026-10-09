import {
  dropSession,
  getSessionAccessToken,
  refreshSessionToken,
  registerSessionBridge,
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
});
