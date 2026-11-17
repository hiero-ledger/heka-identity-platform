import { BaseQueryApi } from '@reduxjs/toolkit/query';
import toast from 'react-hot-toast';

import { registerSessionBridge } from '@/shared/auth/sessionBridge';
import { createMockApi, MockApi } from '@/shared/lib/tests/renderWithProviders';

import { agencyBaseQuery } from './agencyBaseQuery';

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { error: jest.fn() },
}));

const signedIn = () =>
  registerSessionBridge({
    getAccessToken: () => 'token',
    refresh: jest.fn(),
    dropSession: jest.fn(),
    signOut: jest.fn(),
  });

const queryApi = (agencyApi: MockApi, agencyDemoApi: MockApi) =>
  ({ extra: { agencyApi, agencyDemoApi } }) as unknown as BaseQueryApi;

const httpError = (status: number, message?: string) => ({
  isAxiosError: true,
  message: `Request failed with status code ${status}`,
  response: { status, data: message ? { message } : {} },
});

describe('agencyBaseQuery', () => {
  let api: MockApi;
  let demoApi: MockApi;

  beforeEach(() => {
    api = createMockApi();
    demoApi = createMockApi();
    signedIn();
  });

  afterEach(() => registerSessionBridge(null));

  test('sends a GET through the signed-in client with the params and returns the data', async () => {
    api.get.mockResolvedValue({ data: { items: [1] } });

    const result = await agencyBaseQuery(
      { url: '/v2/schemas', params: { isHidden: false } },
      queryApi(api, demoApi),
      {},
    );

    expect(api.get).toHaveBeenCalledWith('/v2/schemas', {
      params: { isHidden: false },
    });
    expect(demoApi.get).not.toHaveBeenCalled();
    expect(result).toEqual({ data: { items: [1] } });
  });

  test('sends a demo request through the demo client', async () => {
    demoApi.get.mockResolvedValue({ data: 'demo' });

    const result = await agencyBaseQuery(
      { url: '/v2/schemas', useDemo: true },
      queryApi(api, demoApi),
      {},
    );

    expect(demoApi.get).toHaveBeenCalledWith('/v2/schemas', {
      params: undefined,
    });
    expect(api.get).not.toHaveBeenCalled();
    expect(result).toEqual({ data: 'demo' });
  });

  test.each([
    ['post', [{ a: 1 }]],
    ['patch', [{ a: 1 }]],
    ['delete', []],
  ] as const)('calls the client by method: %s', async (method, body) => {
    api[method].mockResolvedValue({ data: 'ok' });

    await agencyBaseQuery(
      { url: '/x', method, data: body[0] },
      queryApi(api, demoApi),
      {},
    );

    expect(api[method]).toHaveBeenCalledWith('/x', ...body, {
      params: undefined,
    });
  });

  test('maps a server error to its status and message, shown in one toast', async () => {
    api.get.mockRejectedValue(httpError(404, 'Template not found'));

    const result = await agencyBaseQuery(
      { url: '/issuance-templates/t1' },
      queryApi(api, demoApi),
      {},
    );

    expect(result).toEqual({
      error: { status: 404, message: 'Template not found' },
    });
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith('Template not found');
  });

  test('maps a network failure to its message, without a status', async () => {
    api.get.mockRejectedValue(new Error('Network Error'));

    const result = await agencyBaseQuery(
      { url: '/user' },
      queryApi(api, demoApi),
      {},
    );

    expect(result).toEqual({
      error: { status: undefined, message: 'Network Error' },
    });
    expect(toast.error).toHaveBeenCalledWith('Network Error');
  });

  test('shows no toast for a 401 while nobody is signed in', async () => {
    registerSessionBridge(null);
    api.get.mockRejectedValue(httpError(401, 'Authorization token is missing'));

    const result = await agencyBaseQuery(
      { url: '/user' },
      queryApi(api, demoApi),
      {},
    );

    expect(result).toEqual({
      error: { status: 401, message: 'Authorization token is missing' },
    });
    expect(toast.error).not.toHaveBeenCalled();
  });

  test('shows a 401 of a signed-in session', async () => {
    api.get.mockRejectedValue(httpError(401, 'Token expired'));

    await agencyBaseQuery({ url: '/user' }, queryApi(api, demoApi), {});

    expect(toast.error).toHaveBeenCalledWith('Token expired');
  });
});
