import { agencyEndpoints } from '@/shared/api/config/endpoints';
import {
  cachedQueries,
  requestsTo,
  useLifetimeTimers,
} from '@/shared/lib/tests/apiCache';
import {
  createMockApi,
  createTestStore,
} from '@/shared/lib/tests/renderWithProviders';

import { credentialApi } from './credentialApi';

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { error: jest.fn() },
}));

const CONFIG = agencyEndpoints.getCredentialConfig;
const config = {
  Aries: { credentials: ['anoncreds-indy'], networks: ['indy'] },
};

const setup = () => {
  const api = createMockApi();
  api.get.mockResolvedValue({ data: config });
  return { api, store: createTestStore({}, api) };
};

const { getCredentialConfig } = credentialApi.endpoints;

describe('credentialApi.getCredentialConfig', () => {
  test('fetches the config once for every subscriber and visit', async () => {
    const { api, store } = setup();

    const first = store.dispatch(getCredentialConfig.initiate());
    const second = store.dispatch(getCredentialConfig.initiate());
    await first;
    await second;
    first.unsubscribe();
    second.unsubscribe();
    const third = await store.dispatch(getCredentialConfig.initiate());

    expect(requestsTo(api, CONFIG)).toBe(1);
    expect(third.data).toEqual(config);
  });

  test('keeps the unused config for an hour, then drops it', async () => {
    useLifetimeTimers();
    try {
      const { api, store } = setup();
      const subscription = store.dispatch(getCredentialConfig.initiate());
      await subscription;
      subscription.unsubscribe();

      // Longer than the 30 min of the profile and the 5 min of the lists
      jest.advanceTimersByTime(3_599_000);
      expect(cachedQueries(store)).toEqual(['getCredentialConfig(undefined)']);
      jest.advanceTimersByTime(1_000);
      expect(cachedQueries(store)).toEqual([]);

      await store.dispatch(getCredentialConfig.initiate());
      expect(requestsTo(api, CONFIG)).toBe(2);
    } finally {
      jest.useRealTimers();
    }
  });
});
