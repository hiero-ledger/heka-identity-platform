import axios from 'axios';

import {
  demoTokenEndpoint,
  getDemoAccessToken,
  invalidateDemoAccessToken,
} from './demoToken';

const tokenResponse = (accessToken: string, expiresIn?: number) => ({
  data: {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: expiresIn,
  },
});

describe('demo token', () => {
  const get = jest.spyOn(axios, 'get');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-21T10:00:00Z'));
    get.mockReset();
    invalidateDemoAccessToken();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('fetches the token from the broker once and caches it', async () => {
    get.mockResolvedValue(tokenResponse('demo-token', 300));

    await expect(getDemoAccessToken()).resolves.toBe('demo-token');
    await expect(getDemoAccessToken()).resolves.toBe('demo-token');

    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0][0]).toBe(
      `${process.env.REACT_APP_AGENCY_ENDPOINT}${demoTokenEndpoint}`,
    );
  });

  test('concurrent callers share one request', async () => {
    get.mockResolvedValue(tokenResponse('demo-token', 300));

    const tokens = await Promise.all([
      getDemoAccessToken(),
      getDemoAccessToken(),
      getDemoAccessToken(),
    ]);

    expect(tokens).toEqual(['demo-token', 'demo-token', 'demo-token']);
    expect(get).toHaveBeenCalledTimes(1);
  });

  test('re-fetches half a minute before the reported lifetime elapses', async () => {
    get
      .mockResolvedValueOnce(tokenResponse('first', 300))
      .mockResolvedValue(tokenResponse('second', 300));

    await expect(getDemoAccessToken()).resolves.toBe('first');
    jest.advanceTimersByTime(269 * 1000);
    await expect(getDemoAccessToken()).resolves.toBe('first');
    jest.advanceTimersByTime(2 * 1000);
    await expect(getDemoAccessToken()).resolves.toBe('second');
    expect(get).toHaveBeenCalledTimes(2);
  });

  test('keeps a token for a minute when the broker reports no lifetime', async () => {
    get
      .mockResolvedValueOnce(tokenResponse('first'))
      .mockResolvedValue(tokenResponse('second'));

    await expect(getDemoAccessToken()).resolves.toBe('first');
    jest.advanceTimersByTime(29 * 1000);
    await expect(getDemoAccessToken()).resolves.toBe('first');
    jest.advanceTimersByTime(2 * 1000);
    await expect(getDemoAccessToken()).resolves.toBe('second');
  });

  test('invalidate forces a new fetch', async () => {
    get
      .mockResolvedValueOnce(tokenResponse('first', 300))
      .mockResolvedValue(tokenResponse('second', 300));

    await expect(getDemoAccessToken()).resolves.toBe('first');
    invalidateDemoAccessToken();
    await expect(getDemoAccessToken()).resolves.toBe('second');
  });

  test('rejects when the broker fails and does not cache the failure', async () => {
    get
      .mockRejectedValueOnce(new Error('Request failed with status code 404'))
      .mockResolvedValue(tokenResponse('demo-token', 300));

    await expect(getDemoAccessToken()).rejects.toThrow('404');
    await expect(getDemoAccessToken()).resolves.toBe('demo-token');
  });

  test('rejects a broker response without an access token', async () => {
    get.mockResolvedValue({ data: { token_type: 'Bearer' } });

    await expect(getDemoAccessToken()).rejects.toThrow(/no access token/);
  });
});
