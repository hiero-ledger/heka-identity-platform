import {
  AxiosAdapter,
  AxiosError,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';

import {
  registerSessionBridge,
  SessionBridge,
} from '@/shared/auth/sessionBridge';

import { $agencyApi, currentAccessToken } from './api';

type Reply = (config: InternalAxiosRequestConfig) => Promise<AxiosResponse>;

const ok = (config: InternalAxiosRequestConfig, data: unknown = 'ok') =>
  Promise.resolve({ data, status: 200, statusText: 'OK', headers: {}, config });

const fail = (config: InternalAxiosRequestConfig | undefined, status: number) =>
  Promise.reject(
    new AxiosError(
      `Request failed with status code ${status}`,
      AxiosError.ERR_BAD_REQUEST,
      config,
      null,
      {
        data: { message: 'nope' },
        status,
        statusText: String(status),
        headers: {},
        config: config as InternalAxiosRequestConfig,
      },
    ),
  );

const authHeader = (config: InternalAxiosRequestConfig) =>
  config.headers.Authorization;

describe('$agencyApi interceptors', () => {
  const originalAdapter = $agencyApi.defaults.adapter;
  let adapter: jest.Mock<ReturnType<Reply>, Parameters<Reply>>;
  let bridge: SessionBridge & {
    refresh: jest.Mock;
    dropSession: jest.Mock;
  };
  let token: string | null;

  beforeEach(() => {
    adapter = jest.fn();
    $agencyApi.defaults.adapter = adapter as unknown as AxiosAdapter;
    token = 'token-1';
    bridge = {
      getAccessToken: () => token,
      refresh: jest.fn().mockResolvedValue('token-2'),
      dropSession: jest.fn().mockResolvedValue(undefined),
      signOut: jest.fn().mockResolvedValue(undefined),
    };
    registerSessionBridge(bridge);
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    $agencyApi.defaults.adapter = originalAdapter;
    registerSessionBridge(null);
    jest.restoreAllMocks();
  });

  test('sends the session access token as a bearer token', async () => {
    adapter.mockImplementation((config) => ok(config));

    await expect($agencyApi.get('/user')).resolves.toMatchObject({
      data: 'ok',
    });

    expect(currentAccessToken()).toBe('token-1');
    expect(authHeader(adapter.mock.calls[0][0])).toBe('Bearer token-1');
  });

  test('sends no authorization header when signed out', async () => {
    token = null;
    adapter.mockImplementation((config) => ok(config));

    await $agencyApi.get('/user');

    expect(authHeader(adapter.mock.calls[0][0])).toBeUndefined();
  });

  test('renews the session once on 401 and retries with the new token', async () => {
    adapter
      .mockImplementationOnce((config) => fail(config, 401))
      .mockImplementationOnce((config) => ok(config, 'retried'));

    const response = await $agencyApi.get('/user');

    expect(response.data).toBe('retried');
    expect(bridge.refresh).toHaveBeenCalledTimes(1);
    expect(adapter).toHaveBeenCalledTimes(2);
    expect(authHeader(adapter.mock.calls[1][0])).toBe('Bearer token-2');
    expect(bridge.dropSession).not.toHaveBeenCalled();
  });

  test('renews once when several requests fail with 401 together', async () => {
    // The renewal swaps the session token, as the OIDC bridge does
    bridge.refresh.mockImplementation(async () => {
      token = 'token-2';
      return 'token-2';
    });
    adapter.mockImplementation((config) =>
      authHeader(config) === 'Bearer token-2'
        ? ok(config, config.url)
        : fail(config, 401),
    );

    const responses = await Promise.all([
      $agencyApi.get('/a'),
      $agencyApi.get('/b'),
      $agencyApi.get('/c'),
    ]);

    expect(responses.map((r) => r.data)).toEqual(['/a', '/b', '/c']);
    expect(bridge.refresh).toHaveBeenCalledTimes(1);
    expect(adapter).toHaveBeenCalledTimes(6);
    expect(bridge.dropSession).not.toHaveBeenCalled();
  });

  test('drops the session when the renewal yields no token', async () => {
    bridge.refresh.mockResolvedValue(null);
    adapter.mockImplementation((config) => fail(config, 401));

    await expect($agencyApi.get('/user')).rejects.toMatchObject({
      response: { status: 401 },
    });

    expect(adapter).toHaveBeenCalledTimes(1);
    expect(bridge.dropSession).toHaveBeenCalledTimes(1);
  });

  test('drops the session when the retried request is rejected again', async () => {
    adapter.mockImplementation((config) => fail(config, 401));

    await expect($agencyApi.get('/user')).rejects.toMatchObject({
      response: { status: 401 },
    });

    expect(bridge.refresh).toHaveBeenCalledTimes(1);
    expect(adapter).toHaveBeenCalledTimes(2);
    expect(bridge.dropSession).toHaveBeenCalledTimes(1);
  });

  test('drops the session when the renewal throws', async () => {
    bridge.refresh.mockRejectedValue(new Error('refresh token expired'));
    adapter.mockImplementation((config) => fail(config, 401));

    await expect($agencyApi.get('/user')).rejects.toBeInstanceOf(AxiosError);

    expect(bridge.dropSession).toHaveBeenCalledTimes(1);
  });

  test('does not try to renew without a signed-in session', async () => {
    token = null;
    adapter.mockImplementation((config) => fail(config, 401));

    await expect($agencyApi.get('/user')).rejects.toBeInstanceOf(AxiosError);

    expect(bridge.refresh).not.toHaveBeenCalled();
    expect(bridge.dropSession).not.toHaveBeenCalled();
  });

  test('passes other error statuses through untouched', async () => {
    adapter.mockImplementation((config) => fail(config, 500));

    await expect($agencyApi.get('/user')).rejects.toMatchObject({
      response: { status: 500 },
    });

    expect(bridge.refresh).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  test('passes network errors (no response) through', async () => {
    adapter.mockImplementation((config) =>
      Promise.reject(
        new AxiosError('Network Error', AxiosError.ERR_NETWORK, config),
      ),
    );

    await expect($agencyApi.get('/user')).rejects.toMatchObject({
      code: AxiosError.ERR_NETWORK,
    });

    expect(bridge.refresh).not.toHaveBeenCalled();
  });

  test('passes non-axios errors through', async () => {
    const error = new Error('adapter crashed');
    adapter.mockRejectedValue(error);

    await expect($agencyApi.get('/user')).rejects.toBe(error);

    expect(bridge.refresh).not.toHaveBeenCalled();
  });

  test('rejects a failed response without request configuration', async () => {
    adapter.mockImplementation(() => fail(undefined, 401));

    await expect($agencyApi.get('/user')).rejects.toBeInstanceOf(AxiosError);

    expect(bridge.refresh).not.toHaveBeenCalled();
  });
});
