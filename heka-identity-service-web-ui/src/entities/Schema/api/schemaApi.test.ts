import { waitFor } from '@testing-library/react';

import { issuanceTemplateApi } from '@/entities/IssuanceTemplate/api/issuanceTemplateApi';
import { verificationTemplateApi } from '@/entities/VerificationTemplate/api/verificationTemplateApi';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
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

import { schemaApi } from './schemaApi';
import { changeSchemaVisibility } from '../model/services/changeSchemaVisibility';
import { createNewSchema } from '../model/services/createSchema';
import { registerSchema } from '../model/services/registerSchema';
import { updateSchema } from '../model/services/updateSchema';
import { updateSchemaView } from '../model/services/updateSchemaView';
import { Schema } from '../model/types/schema';

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { error: jest.fn() },
}));

const SCHEMAS = agencyEndpoints.getSchemaList;
const ISSUANCE_TEMPLATES = agencyEndpoints.getIssuanceTemplateList;
const VERIFICATION_TEMPLATES = agencyEndpoints.getVerificationTemplateList;

const schema = (id: string): Schema => ({
  id,
  name: `Schema ${id}`,
  fields: [{ id: `${id}-f`, name: 'name' }],
});

const list = (items: unknown[]) => ({
  data: { items, offset: 0, limit: 100, total: items.length },
});

/** Answers every GET like the identity service; the tenant has s1, the demo tenant demo1 */
const routeGets = (api: MockApi, demoApi?: MockApi) => {
  api.get.mockImplementation((url: string) => {
    if (url === SCHEMAS) return Promise.resolve(list([schema('s1')]));
    if (url === ISSUANCE_TEMPLATES || url === VERIFICATION_TEMPLATES)
      return Promise.resolve(list([]));
    if (url.startsWith('/issuance-templates/'))
      return Promise.resolve({ data: { id: 't1' } });
    return Promise.resolve({ data: schema('s1') });
  });
  demoApi?.get.mockResolvedValue(list([schema('demo1')]));
};

const setup = () => {
  const api = createMockApi();
  const demoApi = createMockApi();
  routeGets(api, demoApi);
  const store = createTestStore({}, api, demoApi);
  return { api, demoApi, store };
};

type TestStore = ReturnType<typeof createTestStore>;
/** A schema write, dispatched to the store */
type Write = (store: TestStore) => Promise<unknown>;

const active = { isHidden: false };
const hidden = { isHidden: true };

describe('schemaApi.getSchemaList', () => {
  test('serves the same filter from the cache: one GET for several subscribers', async () => {
    const { api, store } = setup();

    const first = store.dispatch(
      schemaApi.endpoints.getSchemaList.initiate(active),
    );
    const second = store.dispatch(
      schemaApi.endpoints.getSchemaList.initiate(active),
    );
    await first;
    await second;
    first.unsubscribe();
    // Coming back within the lifetime
    const third = await store.dispatch(
      schemaApi.endpoints.getSchemaList.initiate(active),
    );

    expect(requestsTo(api, SCHEMAS)).toBe(1);
    expect(api.get).toHaveBeenCalledWith(SCHEMAS, { params: active });
    expect(third.data).toEqual([schema('s1')]);
  });

  test('keeps one entry per filter', async () => {
    const { api, store } = setup();

    await store.dispatch(schemaApi.endpoints.getSchemaList.initiate(active));
    await store.dispatch(schemaApi.endpoints.getSchemaList.initiate(hidden));
    await store.dispatch(schemaApi.endpoints.getSchemaList.initiate(active));

    expect(requestsTo(api, SCHEMAS)).toBe(2);
    expect(api.get).toHaveBeenCalledWith(SCHEMAS, { params: hidden });
  });

  test('does not cache a failure: the next subscriber sends the request again', async () => {
    const { api, store } = setup();
    api.get.mockRejectedValueOnce({
      response: { status: 500, data: { message: 'down' } },
    });

    const failed = await store.dispatch(
      schemaApi.endpoints.getSchemaList.initiate(active),
    );
    const retried = await store.dispatch(
      schemaApi.endpoints.getSchemaList.initiate(active),
    );

    expect(failed.error).toEqual({ status: 500, message: 'down' });
    expect(retried.data).toEqual([schema('s1')]);
    expect(requestsTo(api, SCHEMAS)).toBe(2);
  });

  test('drops an unused list 300 s after its last subscriber left, not before', async () => {
    useLifetimeTimers();
    try {
      const { api, store } = setup();
      const subscription = store.dispatch(
        schemaApi.endpoints.getSchemaList.initiate(active),
      );
      await subscription;
      subscription.unsubscribe();

      jest.advanceTimersByTime(299_000);
      expect(cachedQueries(store)).toEqual([
        'getSchemaList({"isHidden":false})',
      ]);

      jest.advanceTimersByTime(1_000);
      expect(cachedQueries(store)).toEqual([]);
      await store.dispatch(
        schemaApi.endpoints.getSchemaList.initiate(active, {
          subscribe: false,
        }),
      );
      expect(requestsTo(api, SCHEMAS)).toBe(2);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('schemaApi.getDemoSchemaList', () => {
  test('reads the demo tenant through the demo client, apart from the tenant list', async () => {
    const { api, demoApi, store } = setup();

    const demo = await store.dispatch(
      schemaApi.endpoints.getDemoSchemaList.initiate(),
    );
    const tenant = await store.dispatch(
      schemaApi.endpoints.getSchemaList.initiate(active),
    );
    await store.dispatch(schemaApi.endpoints.getDemoSchemaList.initiate());

    expect(demoApi.get).toHaveBeenCalledTimes(1);
    expect(demoApi.get).toHaveBeenCalledWith(SCHEMAS, { params: undefined });
    expect(requestsTo(api, SCHEMAS)).toBe(1);
    expect(demo.data).toEqual([schema('demo1')]);
    expect(tenant.data).toEqual([schema('s1')]);
  });
});

describe('schema writes invalidate the cached reads', () => {
  const registration = {
    schemaId: 's1',
    protocol: 'Aries',
    credentialFormat: 'anoncreds',
    network: 'indy',
    did: 'did:indy:1',
  };

  const writes = [
    [
      'createNewSchema',
      (store) => store.dispatch(createNewSchema(new FormData())),
    ],
    [
      'updateSchema (reorder)',
      (store) =>
        store.dispatch(
          updateSchema({ schemaId: 's1', params: { prevSchemaId: null } }),
        ),
    ],
    [
      'changeSchemaVisibility',
      (store) =>
        store.dispatch(
          changeSchemaVisibility({
            schemaId: 's1',
            params: { isHidden: true },
          }),
        ),
    ],
    [
      'updateSchemaView',
      (store) =>
        store.dispatch(
          updateSchemaView({ schemaId: 's1', params: { bgColor: '#fff' } }),
        ),
    ],
    ['registerSchema', (store) => store.dispatch(registerSchema(registration))],
  ] satisfies [string, Write][];

  test.each(writes)(
    '%s refetches a subscribed list once and drops the unused other filter',
    async (_name, write) => {
      const { api, store } = setup();
      api.patch.mockResolvedValue({ data: {} });
      store.dispatch(schemaApi.endpoints.getSchemaList.initiate(active));
      // The hidden list was shown before and has no subscriber now
      const hiddenList = store.dispatch(
        schemaApi.endpoints.getSchemaList.initiate(hidden),
      );
      await hiddenList;
      hiddenList.unsubscribe();
      expect(requestsTo(api, SCHEMAS)).toBe(2);

      await write(store);

      await waitFor(() => expect(requestsTo(api, SCHEMAS)).toBe(3));
      const lastCall = api.get.mock.calls.filter(([url]) => url === SCHEMAS);
      expect(lastCall[2][1]).toEqual({ params: active });
      expect(cachedQueries(store)).not.toContain(
        'getSchemaList({"isHidden":true})',
      );
    },
  );

  test('a failed create also refetches the list: the schema may exist anyway', async () => {
    const { api, store } = setup();
    api.post.mockRejectedValue(new Error('Network Error'));
    store.dispatch(schemaApi.endpoints.getSchemaList.initiate(active));
    await waitFor(() => expect(requestsTo(api, SCHEMAS)).toBe(1));

    const action = await store.dispatch(createNewSchema(new FormData()));

    expect(action.type).toBe('schema/create/rejected');
    await waitFor(() => expect(requestsTo(api, SCHEMAS)).toBe(2));
  });

  test('a failed write invalidates nothing', async () => {
    const { api, store } = setup();
    api.patch.mockRejectedValue(new Error('Network Error'));
    await store.dispatch(schemaApi.endpoints.getSchemaList.initiate(active));

    await store.dispatch(
      updateSchema({ schemaId: 's1', params: { prevSchemaId: null } }),
    );
    await store.dispatch(
      updateSchemaView({ schemaId: 's1', params: { bgColor: '#fff' } }),
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(requestsTo(api, SCHEMAS)).toBe(1);
  });

  const subscribeTemplates = async (store: TestStore) => {
    await Promise.all([
      store.dispatch(
        issuanceTemplateApi.endpoints.getIssuanceTemplateList.initiate(),
      ),
      store.dispatch(
        issuanceTemplateApi.endpoints.getIssuanceTemplate.initiate('t1'),
      ),
      store.dispatch(
        verificationTemplateApi.endpoints.getVerificationTemplateList.initiate(),
      ),
    ]);
  };

  test.each([
    [
      'updateSchemaView',
      (store) =>
        store.dispatch(
          updateSchemaView({ schemaId: 's1', params: { bgColor: '#fff' } }),
        ),
    ],
    ['registerSchema', (store) => store.dispatch(registerSchema(registration))],
  ] satisfies [string, Write][])(
    '%s also refetches the templates, which embed the schema',
    async (_name, write) => {
      const { api, store } = setup();
      api.patch.mockResolvedValue({ data: {} });
      await subscribeTemplates(store);

      await write(store);

      await waitFor(() => {
        expect(requestsTo(api, ISSUANCE_TEMPLATES)).toBe(2);
        expect(requestsTo(api, '/issuance-templates/t1')).toBe(2);
        expect(requestsTo(api, VERIFICATION_TEMPLATES)).toBe(2);
      });
    },
  );

  test.each([
    [
      'createNewSchema',
      (store) => store.dispatch(createNewSchema(new FormData())),
    ],
    [
      'changeSchemaVisibility',
      (store) =>
        store.dispatch(
          changeSchemaVisibility({
            schemaId: 's1',
            params: { isHidden: true },
          }),
        ),
    ],
  ] satisfies [string, Write][])(
    '%s leaves the templates cached',
    async (_name, write) => {
      const { api, store } = setup();
      await subscribeTemplates(store);

      await write(store);

      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(requestsTo(api, ISSUANCE_TEMPLATES)).toBe(1);
      expect(requestsTo(api, VERIFICATION_TEMPLATES)).toBe(1);
    },
  );
});
