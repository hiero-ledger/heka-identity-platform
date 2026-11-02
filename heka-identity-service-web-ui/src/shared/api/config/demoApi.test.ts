import {
  AxiosAdapter,
  AxiosError,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';

import { $agencyDemoApi } from './demoApi';
import { getDemoAccessToken, invalidateDemoAccessToken } from './demoToken';

jest.mock('./demoToken', () => ({
  getDemoAccessToken: jest.fn(),
  invalidateDemoAccessToken: jest.fn(),
}));

type Reply = (config: InternalAxiosRequestConfig) => Promise<AxiosResponse>;

const ok = (config: InternalAxiosRequestConfig) =>
  Promise.resolve({
    data: 'ok',
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  });

const fail = (config: InternalAxiosRequestConfig, status: number) =>
  Promise.reject(
    new AxiosError('failed', AxiosError.ERR_BAD_REQUEST, config, null, {
      data: {},
      status,
      statusText: String(status),
      headers: {},
      config,
    }),
  );

describe('$agencyDemoApi interceptors', () => {
  const originalAdapter = $agencyDemoApi.defaults.adapter;
  const getToken = getDemoAccessToken as jest.Mock;
  let adapter: jest.Mock<ReturnType<Reply>, Parameters<Reply>>;

  beforeEach(() => {
    adapter = jest.fn();
    $agencyDemoApi.defaults.adapter = adapter as unknown as AxiosAdapter;
  });

  afterEach(() => {
    $agencyDemoApi.defaults.adapter = originalAdapter;
  });

  test('authenticates with the demo token', async () => {
    getToken.mockResolvedValue('demo-1');
    adapter.mockImplementation(ok);

    await $agencyDemoApi.get('/v2/schemas');

    expect(adapter.mock.calls[0][0].headers.Authorization).toBe(
      'Bearer demo-1',
    );
  });

  test('refreshes the demo token once on 401 and retries', async () => {
    getToken.mockResolvedValueOnce('stale').mockResolvedValueOnce('fresh');
    adapter
      .mockImplementationOnce((config) => fail(config, 401))
      .mockImplementationOnce(ok);

    const response = await $agencyDemoApi.get('/v2/schemas');

    expect(response.data).toBe('ok');
    expect(invalidateDemoAccessToken).toHaveBeenCalledTimes(1);
    expect(adapter).toHaveBeenCalledTimes(2);
    expect(adapter.mock.calls[1][0].headers.Authorization).toBe('Bearer fresh');
  });

  test('gives up when the retry is rejected as well', async () => {
    getToken.mockResolvedValue('token');
    adapter.mockImplementation((config) => fail(config, 401));

    await expect($agencyDemoApi.get('/v2/schemas')).rejects.toMatchObject({
      response: { status: 401 },
    });

    expect(adapter).toHaveBeenCalledTimes(2);
    expect(invalidateDemoAccessToken).toHaveBeenCalledTimes(1);
  });

  test('passes other errors through', async () => {
    getToken.mockResolvedValue('token');
    adapter.mockImplementation((config) => fail(config, 403));

    await expect($agencyDemoApi.get('/v2/schemas')).rejects.toMatchObject({
      response: { status: 403 },
    });

    expect(invalidateDemoAccessToken).not.toHaveBeenCalled();
  });
});
