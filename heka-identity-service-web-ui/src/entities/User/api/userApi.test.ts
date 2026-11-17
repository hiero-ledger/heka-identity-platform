import { waitFor } from '@testing-library/react';

import { schemaApi } from '@/entities/Schema/api/schemaApi';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import { registerSessionBridge } from '@/shared/auth/sessionBridge';
import {
  cachedQueries,
  requestsTo,
  useLifetimeTimers,
} from '@/shared/lib/tests/apiCache';
import {
  createMockApi,
  createTestStore,
  MockApi,
} from '@/shared/lib/tests/renderWithProviders';

import { userApi } from './userApi';
import { patchAgencyUser } from '../model/services/patchAgencyUser';
import { PreparedDid, prepareWallet } from '../model/services/prepareWallet';
import { signOut } from '../model/services/signOut';

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { error: jest.fn() },
}));

const USER = agencyEndpoints.getUserData;
const DIDS = agencyEndpoints.getDids;
const SCHEMAS = agencyEndpoints.getSchemaList;

const profile = {
  name: 'Heka Issuer',
  backgroundColor: '#123456',
  logo: '/logo.png',
  registeredAt: '2026-01-01',
  messageDeliveryType: 'WebSocket',
};

const routeGets = (api: MockApi) =>
  api.get.mockImplementation(
    (url: string, config?: { params?: { method?: string } }) => {
      if (url === USER) return Promise.resolve({ data: profile });
      if (url === DIDS) {
        const method = config?.params?.method ?? 'any';
        return Promise.resolve({
          data: [{ id: `did:${method}:1`, verificationMethod: [] }],
        });
      }
      return Promise.resolve({ data: { items: [] } });
    },
  );

const setup = () => {
  const api = createMockApi();
  routeGets(api);
  const store = createTestStore({}, api);
  return { api, store };
};

const { getProfile, getOwnDids } = userApi.endpoints;

describe('userApi.getProfile', () => {
  test('fetches the profile once and mirrors its fields into the user slice', async () => {
    const { api, store } = setup();

    const first = store.dispatch(getProfile.initiate());
    await first;
    first.unsubscribe();
    // Home → Profile → Home
    await store.dispatch(getProfile.initiate());
    await store.dispatch(getProfile.initiate());

    expect(requestsTo(api, USER)).toBe(1);
    expect(api.get).toHaveBeenCalledWith(USER, { params: undefined });
    expect(store.getState().user.data).toMatchObject({
      issuerName: 'Heka Issuer',
      backgroundColor: '#123456',
      logo: '/logo.png',
      registeredAt: '2026-01-01',
    });
    // Unchanged behaviour: the delivery type is not mirrored
    expect(store.getState().user.data?.messageDeliveryType).toBeUndefined();
  });

  test('keeps the unused profile for 30 min, then drops it', async () => {
    useLifetimeTimers();
    try {
      const { api, store } = setup();
      const subscription = store.dispatch(getProfile.initiate());
      await subscription;
      subscription.unsubscribe();

      jest.advanceTimersByTime(1_799_000);
      expect(cachedQueries(store)).toEqual(['getProfile(undefined)']);
      jest.advanceTimersByTime(1_000);
      expect(cachedQueries(store)).toEqual([]);

      await store.dispatch(getProfile.initiate());
      expect(requestsTo(api, USER)).toBe(2);
    } finally {
      jest.useRealTimers();
    }
  });

  test('a saved profile field updates the cache from the PATCH response, without a GET', async () => {
    const { api, store } = setup();
    api.patch.mockResolvedValue({ data: { ...profile, name: 'Renamed' } });
    await store.dispatch(getProfile.initiate());

    await store.dispatch(patchAgencyUser({ name: 'Renamed' }));

    expect(requestsTo(api, USER)).toBe(1);
    expect(getProfile.select()(store.getState()).data?.name).toBe('Renamed');
    expect(store.getState().user.data?.issuerName).toBe('Renamed');
  });

  test.each([
    ['a new issuer name refetches', { name: 'Renamed' }, 2],
    ['other profile fields keep', { backgroundColor: '#654321' }, 1],
  ])(
    '%s the schema list (its schemas carry the issuer name)',
    async (_name, change, schemaListRequests) => {
      const { api, store } = setup();
      api.patch.mockResolvedValue({ data: { ...profile, ...change } });
      await store.dispatch(getProfile.initiate());
      // The list shown on another page, still subscribed
      await store.dispatch(
        schemaApi.endpoints.getSchemaList.initiate({ isHidden: false }),
      );

      await store.dispatch(patchAgencyUser({ name: profile.name, ...change }));

      // Invalidation refetches a subscribed entry asynchronously: give it time to start
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(requestsTo(api, SCHEMAS)).toBe(schemaListRequests);
    },
  );
});

describe('userApi.getOwnDids', () => {
  test('keeps one entry per DID method', async () => {
    const { api, store } = setup();

    await store.dispatch(getOwnDids.initiate({ method: 'indy' }));
    const key = await store.dispatch(getOwnDids.initiate({ method: 'key' }));
    const indy = await store.dispatch(getOwnDids.initiate({ method: 'indy' }));
    // The registrations modal asks for all methods: an entry of its own, shared by every schema
    await store.dispatch(getOwnDids.initiate({}));
    await store.dispatch(getOwnDids.initiate({}));

    expect(requestsTo(api, DIDS)).toBe(3);
    expect(api.get).toHaveBeenCalledWith(DIDS, {
      params: { own: true, method: 'indy' },
    });
    expect(api.get).toHaveBeenCalledWith(DIDS, {
      params: { own: true, method: undefined },
    });
    expect(key.data).toEqual([{ id: 'did:key:1', verificationMethod: [] }]);
    expect(indy.data).toEqual([{ id: 'did:indy:1', verificationMethod: [] }]);
  });

  test('keeps unused DIDs for 30 min', async () => {
    useLifetimeTimers();
    try {
      const { store } = setup();
      const subscription = store.dispatch(
        getOwnDids.initiate({ method: 'key' }),
      );
      await subscription;
      subscription.unsubscribe();

      jest.advanceTimersByTime(1_799_000);
      expect(cachedQueries(store)).toHaveLength(1);
      jest.advanceTimersByTime(1_000);
      expect(cachedQueries(store)).toEqual([]);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('prepareWallet invalidation', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      blob: () => Promise.resolve(new Blob(['png'], { type: 'image/png' })),
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    localStorage.clear();
  });

  const prepare = async (statuses: PreparedDid['status'][]) => {
    const { api, store } = setup();
    api.post.mockResolvedValue({
      data: {
        did: 'did:key:main',
        dids: statuses.map((status, i) => ({
          method: `m${i}`,
          did: status === 'failed' ? undefined : `did:m${i}:1`,
          status,
        })),
      },
    });
    await Promise.all([
      store.dispatch(getProfile.initiate()),
      store.dispatch(getOwnDids.initiate({ method: 'key' })),
      store.dispatch(
        schemaApi.endpoints.getSchemaList.initiate({ isHidden: false }),
      ),
    ]);

    await store.dispatch(prepareWallet());
    return { api, store };
  };

  test('a created DID refetches the profile and the own DIDs, never the schemas', async () => {
    const { api, store } = await prepare(['created', 'existing', 'failed']);

    await waitFor(() => {
      expect(requestsTo(api, USER)).toBe(2);
      expect(requestsTo(api, DIDS)).toBe(2);
    });
    expect(requestsTo(api, SCHEMAS)).toBe(1);
    // ...but a failed one still leaves the wallet to be prepared again
    expect(store.getState().user.isWalletPrepared).toBe(false);
  });

  test.each([
    [['existing', 'existing']],
    [['existing', 'skipped']],
    [['existing', 'failed']],
  ] as const)('DIDs %j invalidate nothing', async (statuses) => {
    const { api } = await prepare([...statuses]);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(requestsTo(api, USER)).toBe(1);
    expect(requestsTo(api, DIDS)).toBe(1);
    expect(requestsTo(api, SCHEMAS)).toBe(1);
  });
});

describe('signOut', () => {
  afterEach(() => registerSessionBridge(null));

  test('empties the cache before the provider logout', async () => {
    const { store } = setup();
    await store.dispatch(getProfile.initiate());
    await store.dispatch(getOwnDids.initiate({ method: 'key' }));
    let cacheAtLogout: string[] = [];
    registerSessionBridge({
      getAccessToken: () => 'tok',
      refresh: jest.fn(),
      dropSession: jest.fn(),
      signOut: jest.fn(async () => {
        cacheAtLogout = cachedQueries(store);
      }),
    });

    await store.dispatch(signOut());

    expect(cacheAtLogout).toEqual([]);
    expect(store.getState().agencyApi.queries).toEqual({});
    expect(store.getState().user.isWalletPrepared).toBe(false);
  });
});
