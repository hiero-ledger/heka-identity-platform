import toast from 'react-hot-toast';

import {
  createMockApi,
  createTestStore,
  MockApi,
} from '@/shared/lib/tests/renderWithProviders';

import { getDids } from './getDids';
import {
  getDidById,
  getDidItems,
  getDidsError,
  getDidsFailedMethods,
  getDidsIsLoading,
} from '../selectors/didsSelector';
import { DidDocument } from '../types/did';

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { error: jest.fn(), success: jest.fn() },
}));

const apiError = (message: string, status = 500) => ({
  isAxiosError: true,
  response: { status, data: { message } },
});

const doc = (id: string, extra: Partial<DidDocument> = {}): DidDocument => ({
  '@context': ['https://www.w3.org/ns/did/v1'],
  id,
  ...extra,
});

type Response = DidDocument[] | ReturnType<typeof apiError>;

/** Answers `GET /dids/methods` and one `GET /dids` per method. */
const route = (
  api: MockApi,
  methods: string[] | ReturnType<typeof apiError>,
  dids: Record<string, Response | (() => Promise<unknown>)>,
) => {
  api.get.mockImplementation(
    (url: string, config?: { params?: { method?: string } }) => {
      if (url === '/dids/methods') {
        return Array.isArray(methods)
          ? Promise.resolve({ data: { methods } })
          : Promise.reject(methods);
      }
      const result = dids[config?.params?.method ?? ''] ?? [];
      if (typeof result === 'function') return result();
      return Array.isArray(result)
        ? Promise.resolve({ data: result })
        : Promise.reject(result);
    },
  );
};

describe('getDids', () => {
  test('requests the methods, then the own DIDs once per method, never without a method (AC3)', async () => {
    const api = createMockApi();
    route(api, ['indy', 'key', 'hedera'], {});
    const store = createTestStore({}, api);

    await store.dispatch(getDids());

    expect(api.get).toHaveBeenNthCalledWith(1, '/dids/methods');
    const didCalls = api.get.mock.calls.filter(([url]) => url === '/dids');
    expect(didCalls.map(([, config]) => config)).toEqual([
      { params: { own: true, method: 'indy' } },
      { params: { own: true, method: 'key' } },
      { params: { own: true, method: 'hedera' } },
    ]);
  });

  test('stores the DIDs ordered by method, de-duplicated and with `@context` (AC4)', async () => {
    const api = createMockApi();
    route(api, ['indy', 'key', 'hedera'], {
      // Served in a different order than the configured methods
      hedera: [doc('did:hedera:testnet:z1_0.0.1')],
      key: [
        doc('did:key:z1'),
        { context: ['ctx'], id: 'did:key:z2' } as unknown as DidDocument,
        doc('did:key:z1'),
      ],
      indy: [doc('did:indy:bcovrin:test:a')],
    });
    const store = createTestStore({}, api);

    await store.dispatch(getDids());

    const items = getDidItems(store.getState());
    expect(items?.map((d) => d.id)).toEqual([
      'did:indy:bcovrin:test:a',
      'did:key:z1',
      'did:key:z2',
      'did:hedera:testnet:z1_0.0.1',
    ]);
    expect(items?.[2]).toEqual({ '@context': ['ctx'], id: 'did:key:z2' });
    expect(getDidsFailedMethods(store.getState())).toEqual([]);
    expect(getDidsIsLoading(store.getState())).toBe(false);
    expect(getDidById('did:key:z2')(store.getState())?.id).toBe('did:key:z2');
    expect(getDidById(undefined)(store.getState())).toBeUndefined();
  });

  test('a failed method keeps the others and is reported without a toast (AC5a)', async () => {
    const api = createMockApi();
    route(api, ['indy', 'key', 'hedera'], {
      indy: [doc('did:indy:bcovrin:test:a')],
      key: [doc('did:key:z1')],
      hedera: apiError('Hedera mirror node unavailable'),
    });
    const store = createTestStore({}, api);

    const action = await store.dispatch(getDids());

    expect(action.type).toBe('dids/getDids/fulfilled');
    expect(getDidItems(store.getState())?.map((d) => d.id)).toEqual([
      'did:indy:bcovrin:test:a',
      'did:key:z1',
    ]);
    expect(getDidsFailedMethods(store.getState())).toEqual([
      { method: 'hedera', message: 'Hedera mirror node unavailable' },
    ]);
    expect(getDidsError(store.getState())).toBeUndefined();
    expect(toast.error).not.toHaveBeenCalled();
  });

  test('rejects with the server message when every method fails', async () => {
    const api = createMockApi();
    route(api, ['indy', 'key'], {
      indy: apiError('Ledger unreachable'),
      key: apiError('Wallet busy'),
    });
    const store = createTestStore({}, api);

    const action = await store.dispatch(getDids());

    expect(action.type).toBe('dids/getDids/rejected');
    expect(getDidsError(store.getState())).toBe('Ledger unreachable');
    expect(getDidItems(store.getState())).toBeUndefined();
    expect(getDidsFailedMethods(store.getState())).toBeUndefined();
    expect(toast.error).toHaveBeenCalledWith('Ledger unreachable');
  });

  test('rejects with the server message when the methods cannot be read', async () => {
    const api = createMockApi();
    route(api, apiError('Forbidden', 403), {});
    const store = createTestStore({}, api);

    await store.dispatch(getDids());

    expect(getDidsError(store.getState())).toBe('Forbidden');
    expect(api.get).not.toHaveBeenCalledWith('/dids', expect.anything());
  });

  test.each([
    ['without `methods`', {}],
    ['with a non-array `methods`', { methods: 'key' }],
    ['with non-string methods', { methods: ['key', 1] }],
  ])(
    'rejects with a readable message when the methods answer is %s',
    async (_, data) => {
      const api = createMockApi();
      api.get.mockResolvedValue({ data });
      const store = createTestStore({}, api);

      await store.dispatch(getDids());

      const message = 'The identity service returned no list of DID methods.';
      expect(getDidsError(store.getState())).toBe(message);
      expect(toast.error).toHaveBeenCalledWith(message);
      expect(api.get).toHaveBeenCalledTimes(1);
    },
  );

  test('resolves with an empty list when no method is configured', async () => {
    const api = createMockApi();
    route(api, [], {});
    const store = createTestStore({}, api);

    await store.dispatch(getDids());

    expect(getDidItems(store.getState())).toEqual([]);
    expect(getDidsError(store.getState())).toBeUndefined();
  });

  test('a retry clears the error and the partial failure on success', async () => {
    const api = createMockApi();
    route(api, ['key', 'hedera'], {
      key: [doc('did:key:z1')],
      hedera: apiError('Timeout'),
    });
    const store = createTestStore({}, api);
    await store.dispatch(getDids());
    expect(getDidsFailedMethods(store.getState())).toHaveLength(1);

    route(api, ['key', 'hedera'], {
      key: [doc('did:key:z1')],
      hedera: [doc('did:hedera:testnet:z1_0.0.1')],
    });
    await store.dispatch(getDids());

    expect(getDidsFailedMethods(store.getState())).toEqual([]);
    expect(getDidItems(store.getState())).toHaveLength(2);
  });

  test('ignores the response of an older request that resolves last', async () => {
    const api = createMockApi();
    let resolveFirst: (value: unknown) => void = () => {};
    const first = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    route(api, ['key'], { key: () => first });
    const store = createTestStore({}, api);

    const firstRequest = store.dispatch(getDids());
    // Let the first request reach `GET /dids`, then start a second one that answers at once
    await new Promise((resolve) => setTimeout(resolve, 0));
    route(api, ['key'], { key: [doc('did:key:new')] });
    await store.dispatch(getDids());
    expect(getDidItems(store.getState())?.map((d) => d.id)).toEqual([
      'did:key:new',
    ]);

    resolveFirst({ data: [doc('did:key:stale')] });
    await firstRequest;

    expect(getDidItems(store.getState())?.map((d) => d.id)).toEqual([
      'did:key:new',
    ]);
    expect(getDidsIsLoading(store.getState())).toBe(false);
  });

  test('ignores a stale rejection', async () => {
    const api = createMockApi();
    let rejectFirst: (reason: unknown) => void = () => {};
    const first = new Promise((_, reject) => {
      rejectFirst = reject;
    });
    route(api, ['key'], { key: () => first });
    const store = createTestStore({}, api);

    const firstRequest = store.dispatch(getDids());
    await new Promise((resolve) => setTimeout(resolve, 0));
    route(api, ['key'], { key: [doc('did:key:new')] });
    await store.dispatch(getDids());

    rejectFirst(apiError('Late failure'));
    await firstRequest;

    expect(getDidsError(store.getState())).toBeUndefined();
    expect(getDidItems(store.getState())).toHaveLength(1);
  });
});
