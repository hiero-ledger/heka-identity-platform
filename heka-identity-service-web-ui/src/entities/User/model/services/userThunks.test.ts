import toast from 'react-hot-toast';

import { defaultLogoImagePath } from '@/const/image';
import { USER_ID } from '@/entities/User/model/const';
import {
  getIsPreparingUser,
  getUser,
  getUserAccessToken,
  getUserDid,
  getUserDidDocuments,
  getUserDidMethods,
  getUserError,
  getUserId,
  getUserIsSignedIn,
  getUserMessageDeliveryType,
  getUserName,
} from '@/entities/User/model/selectors/userSelector';
import { userActions } from '@/entities/User/model/slices/userSlice';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import {
  registerSessionBridge,
  SessionBridge,
} from '@/shared/auth/sessionBridge';
import {
  createMockApi,
  createTestStore,
} from '@/shared/lib/tests/renderWithProviders';

import { fetchDidDocuments } from './fetchDidDocuments';
import { fetchDidMethods } from './fetchDidMethods';
import { getAgencyUser } from './getAgencyUser';
import { patchAgencyUser } from './patchAgencyUser';
import { prepareWallet } from './prepareWallet';
import { signOut } from './signOut';

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { error: jest.fn() },
}));

const apiError = (message: string) => ({
  isAxiosError: true,
  response: { status: 400, data: { message } },
});

const signedIn = {
  user: {
    isLoading: false,
    isPreparing: false,
    data: { name: 'Ada', did: 'did:key:1', tokens: { accessToken: 'tok' } },
  },
};

afterEach(() => {
  localStorage.clear();
  registerSessionBridge(null);
});

describe('user selectors', () => {
  test('read the signed-in user', () => {
    const state = createTestStore({
      user: {
        ...signedIn.user,
        error: 'oops',
        data: {
          ...signedIn.user.data,
          didMethods: ['key'],
          didDocuments: [{ id: 'did:key:1', verificationMethod: [] }],
          messageDeliveryType: 'WebSocket',
        },
      },
    }).getState();

    expect(getUserIsSignedIn(state)).toBe(true);
    expect(getUserAccessToken(state)).toBe('tok');
    expect(getUserDid(state)).toBe('did:key:1');
    expect(getUserId(state)).toBe('did:key:1');
    expect(getUserDidMethods(state)).toEqual(['key']);
    expect(getUserDidDocuments(state)).toHaveLength(1);
    expect(getUserError(state)).toBe('oops');
    expect(getIsPreparingUser(state)).toBe(false);
    expect(getUserName(state)).toBe('Ada');
    expect(getUser(state)?.name).toBe('Ada');
    expect(getUserMessageDeliveryType(state)).toBe('WebSocket');
  });

  test('a user without a token is signed out', () => {
    const state = createTestStore({
      user: { isLoading: false, isPreparing: false },
    }).getState();

    expect(getUserIsSignedIn(state)).toBe(false);
    expect(getUserAccessToken(state)).toBeUndefined();
  });
});

describe('userSlice session reducers', () => {
  test('setSession and clearSession mirror the OIDC session', () => {
    const store = createTestStore({
      user: { isLoading: false, isPreparing: false, data: { did: 'did:1' } },
    });

    store.dispatch(userActions.setSession({ accessToken: 'a', name: 'Ada' }));
    expect(store.getState().user.data).toEqual({
      did: 'did:1',
      name: 'Ada',
      tokens: { accessToken: 'a' },
    });

    store.dispatch(userActions.clearSession());
    expect(store.getState().user.data).toEqual({
      did: 'did:1',
      name: null,
      tokens: { accessToken: null },
    });
  });

  test('reset reads the stored DID again', () => {
    localStorage.setItem(USER_ID, 'did:stored');
    const store = createTestStore(signedIn);

    store.dispatch(userActions.reset());

    expect(store.getState().user).toEqual({
      isLoading: false,
      isPreparing: false,
      error: undefined,
      data: { name: null, did: 'did:stored', tokens: { accessToken: null } },
    });
  });

  test('setSession and clearSession work without user data', () => {
    const store = createTestStore({
      user: { isLoading: false, isPreparing: false },
    });

    store.dispatch(userActions.clearSession());
    expect(getUserName(store.getState())).toBeNull();
  });
});

describe('getAgencyUser / patchAgencyUser', () => {
  const profile = {
    name: 'Heka Issuer',
    backgroundColor: '#123456',
    logo: '/logo.png',
    registeredAt: '2026-01-01',
  };

  test('getAgencyUser stores the issuer profile', async () => {
    const api = createMockApi();
    api.get.mockResolvedValue({ data: profile });
    const store = createTestStore(signedIn, api);

    await store.dispatch(getAgencyUser());

    expect(api.get).toHaveBeenCalledWith(agencyEndpoints.getUserData);
    expect(store.getState().user.data).toMatchObject({
      did: 'did:key:1',
      issuerName: 'Heka Issuer',
      backgroundColor: '#123456',
      logo: '/logo.png',
      registeredAt: '2026-01-01',
    });
  });

  test('getAgencyUser rejects with the server message', async () => {
    const api = createMockApi();
    api.get.mockRejectedValue(apiError('no user'));
    const store = createTestStore(signedIn, api);

    const action = await store.dispatch(getAgencyUser());

    expect(action.payload).toBe('no user');
    expect(toast.error).toHaveBeenCalledWith('no user');
  });

  test('patchAgencyUser sends only the set fields as a form', async () => {
    const api = createMockApi();
    api.patch.mockResolvedValue({ data: { ...profile, name: 'Renamed' } });
    const store = createTestStore(signedIn, api);

    await store.dispatch(
      patchAgencyUser({
        name: 'Renamed',
        webHook: null,
        backgroundColor: undefined,
        resetLogo: 'true',
      }),
    );

    const [url, form] = api.patch.mock.calls[0];
    expect(url).toBe(agencyEndpoints.patchUserData);
    expect(Object.fromEntries((form as FormData).entries())).toEqual({
      name: 'Renamed',
      resetLogo: 'true',
    });
    expect(store.getState().user.data?.issuerName).toBe('Renamed');
  });

  test('patchAgencyUser rejects with the server message', async () => {
    const api = createMockApi();
    api.patch.mockRejectedValue(apiError('invalid colour'));
    const store = createTestStore(signedIn, api);

    const action = await store.dispatch(patchAgencyUser({ name: 'x' }));

    expect(action.payload).toBe('invalid colour');
  });
});

describe('prepareWallet', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      blob: () => Promise.resolve(new Blob(['png'], { type: 'image/png' })),
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('uploads the default logo, stores the DID and marks the user prepared', async () => {
    const api = createMockApi();
    api.post.mockResolvedValue({ data: { did: 'did:key:new' } });
    const store = createTestStore(signedIn, api);

    const pending = store.dispatch(prepareWallet());
    expect(getIsPreparingUser(store.getState())).toBe(true);
    await pending;

    expect(global.fetch).toHaveBeenCalledWith(defaultLogoImagePath);
    const [url, form] = api.post.mock.calls[0];
    expect(url).toBe(agencyEndpoints.prepareWallet);
    expect((form as FormData).get('userLogo')).toBeInstanceOf(Blob);
    expect(localStorage.getItem(USER_ID)).toBe('did:key:new');
    expect(store.getState().user).toMatchObject({
      isLoading: false,
      isPreparing: false,
      error: undefined,
      data: { did: 'did:key:new', name: 'Ada' },
    });
  });

  test('stores the error on failure', async () => {
    const api = createMockApi();
    api.post.mockRejectedValue(apiError('wallet exists'));
    const store = createTestStore(signedIn, api);

    await store.dispatch(prepareWallet());

    expect(localStorage.getItem(USER_ID)).toBeNull();
    expect(store.getState().user).toMatchObject({
      isLoading: false,
      isPreparing: false,
      error: 'wallet exists',
    });
  });
});

describe('fetchDidMethods / fetchDidDocuments', () => {
  test('fetchDidMethods stores the methods', async () => {
    const api = createMockApi();
    api.get.mockResolvedValue({ data: { methods: ['key', 'indy'] } });
    const store = createTestStore(signedIn, api);

    await store.dispatch(fetchDidMethods());

    expect(api.get).toHaveBeenCalledWith(agencyEndpoints.getDidMethods);
    expect(getUserDidMethods(store.getState())).toEqual(['key', 'indy']);
  });

  test('fetchDidMethods stores the error on failure', async () => {
    const api = createMockApi();
    api.get.mockRejectedValue(apiError('methods down'));
    const store = createTestStore(signedIn, api);

    await store.dispatch(fetchDidMethods());

    expect(getUserError(store.getState())).toBe('methods down');
  });

  test('fetchDidDocuments asks for own DIDs of the method', async () => {
    const docs = [{ id: 'did:key:1', verificationMethod: [{ id: 'vm' }] }];
    const api = createMockApi();
    api.get.mockResolvedValue({ data: docs });
    const store = createTestStore(signedIn, api);

    await store.dispatch(fetchDidDocuments({ method: 'key' }));

    expect(api.get).toHaveBeenCalledWith(agencyEndpoints.getDids, {
      params: { own: true, method: 'key' },
    });
    expect(getUserDidDocuments(store.getState())).toEqual(docs);
  });

  test('fetchDidDocuments stores the error on failure', async () => {
    const api = createMockApi();
    api.get.mockRejectedValue(apiError('dids down'));
    const store = createTestStore(signedIn, api);

    await store.dispatch(fetchDidDocuments({}));

    expect(getUserError(store.getState())).toBe('dids down');
  });
});

describe('signOut', () => {
  const bridge = (overrides: Partial<SessionBridge> = {}): SessionBridge => ({
    getAccessToken: () => 'tok',
    refresh: jest.fn().mockResolvedValue(null),
    dropSession: jest.fn().mockResolvedValue(undefined),
    signOut: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  });

  test('forgets the DID, logs out at the provider and clears the user', async () => {
    localStorage.setItem(USER_ID, 'did:key:1');
    const session = bridge();
    registerSessionBridge(session);
    const store = createTestStore(signedIn);

    const action = await store.dispatch(signOut());

    expect(action.type).toBe('oauth/signOut/fulfilled');
    expect(session.signOut).toHaveBeenCalled();
    expect(localStorage.getItem(USER_ID)).toBeNull();
    expect(store.getState().user.data).toBeUndefined();
  });

  test('rejects with the logout error', async () => {
    registerSessionBridge(
      bridge({ signOut: jest.fn().mockRejectedValue(new Error('idp down')) }),
    );
    const store = createTestStore(signedIn);

    const action = await store.dispatch(signOut());

    expect(action.type).toBe('oauth/signOut/rejected');
    expect(action.payload).toBe('idp down');
  });
});
