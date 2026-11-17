import { waitFor } from '@testing-library/react';
import toast from 'react-hot-toast';

import { ProtocolType, Schema } from '@/entities/Schema';
import { AriesCredentialFormat } from '@/entities/Schema/model/types/schema';
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

import { issuanceTemplateApi } from './issuanceTemplateApi';
import { createIssuanceTemplate } from '../model/services/createIssuanceTemplate';
import { deleteIssuanceTemplate } from '../model/services/deleteIssuanceTemplate';
import { updateIssuanceTemplate } from '../model/services/updateIssuanceTemplate';
import { IssuanceTemplate } from '../model/types/issuanceTemplate';

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { error: jest.fn() },
}));

const LIST_URL = agencyEndpoints.getIssuanceTemplateList;
const ITEM_URL = agencyEndpoints.getSingleIssuanceTemplate('t1');

const template = (id: string) => ({ id, name: id }) as IssuanceTemplate;

const schema: Schema = { id: 's1', fields: [{ id: 'f1', name: 'name' }] };

const { getIssuanceTemplateList, getIssuanceTemplate } =
  issuanceTemplateApi.endpoints;

/** The identity service; `missing` ids answer 404 like a template deleted elsewhere */
const setup = (missing: string[] = []) => {
  const api = createMockApi();
  api.get.mockImplementation((url: string) => {
    if (url === LIST_URL)
      return Promise.resolve({ data: { items: [template('t1')] } });
    const id = url.split('/').pop()!;
    if (missing.includes(id))
      return Promise.reject({
        isAxiosError: true,
        response: { status: 404, data: { message: 'Template not found' } },
      });
    return Promise.resolve({ data: template(id) });
  });
  api.post.mockResolvedValue({ data: template('t2') });
  const store = createTestStore({}, api);
  return { api, store };
};

describe('issuanceTemplateApi reads', () => {
  test('caches the list and a single template: one GET each across visits', async () => {
    const { api, store } = setup();

    const list = store.dispatch(getIssuanceTemplateList.initiate());
    const single = store.dispatch(getIssuanceTemplate.initiate('t1'));
    await list;
    await single;
    list.unsubscribe();
    single.unsubscribe();
    const again = await store.dispatch(getIssuanceTemplateList.initiate());
    const singleAgain = await store.dispatch(
      getIssuanceTemplate.initiate('t1'),
    );

    expect(requestsTo(api, LIST_URL)).toBe(1);
    expect(requestsTo(api, ITEM_URL)).toBe(1);
    expect(api.get).toHaveBeenCalledWith(LIST_URL, { params: undefined });
    expect(again.data).toEqual([template('t1')]);
    expect(singleAgain.data).toEqual(template('t1'));
  });

  test('drops unused entries 300 s after their last subscriber left', async () => {
    useLifetimeTimers();
    try {
      const { api, store } = setup();
      const list = store.dispatch(getIssuanceTemplateList.initiate());
      const single = store.dispatch(getIssuanceTemplate.initiate('t1'));
      await list;
      await single;
      list.unsubscribe();
      single.unsubscribe();

      jest.advanceTimersByTime(299_000);
      expect(cachedQueries(store)).toHaveLength(2);
      jest.advanceTimersByTime(1_000);
      expect(cachedQueries(store)).toEqual([]);

      await store.dispatch(getIssuanceTemplate.initiate('t1'));
      expect(requestsTo(api, ITEM_URL)).toBe(2);
    } finally {
      jest.useRealTimers();
    }
  });

  test('a 404 on a template refetches the cached list (deleted elsewhere), with one toast', async () => {
    const { api, store } = setup(['gone']);
    await store.dispatch(getIssuanceTemplateList.initiate());

    const result = await store.dispatch(getIssuanceTemplate.initiate('gone'));

    expect(result.error).toEqual({
      status: 404,
      message: 'Template not found',
    });
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith('Template not found');
    await waitFor(() => expect(requestsTo(api, LIST_URL)).toBe(2));
  });

  test('another failure of a template leaves the list cached', async () => {
    const { api, store } = setup();
    await store.dispatch(getIssuanceTemplateList.initiate());
    api.get.mockRejectedValueOnce({
      response: { status: 500, data: { message: 'down' } },
    });

    const result = await store.dispatch(getIssuanceTemplate.initiate('t1'));

    expect(result.error).toEqual({ status: 500, message: 'down' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(requestsTo(api, LIST_URL)).toBe(1);
  });
});

describe('issuance template writes invalidate the cached reads', () => {
  const subscribe = async (store: ReturnType<typeof createTestStore>) => {
    await Promise.all([
      store.dispatch(getIssuanceTemplateList.initiate()),
      store.dispatch(getIssuanceTemplate.initiate('t1')),
      store.dispatch(getIssuanceTemplate.initiate('t3')),
    ]);
  };

  test('create refetches the list only', async () => {
    const { api, store } = setup();
    await subscribe(store);

    await store.dispatch(
      createIssuanceTemplate({
        name: 'New',
        protocolType: ProtocolType.Aries,
        credentialType: AriesCredentialFormat.AnoncredsIndy,
        network: 'indy',
        did: 'did:indy:1',
        schema,
        credentialValues: { name: 'Ada' },
      }),
    );

    await waitFor(() => expect(requestsTo(api, LIST_URL)).toBe(2));
    expect(requestsTo(api, ITEM_URL)).toBe(1);
  });

  test.each([
    ['content', { schema, credentialValues: { name: 'Grace' } }],
    ['order', { previousTemplateId: null }],
  ])(
    'an update of the %s refetches the list and that template only',
    async (_name, params) => {
      const { api, store } = setup();
      await subscribe(store);

      await store.dispatch(
        updateIssuanceTemplate({ templateId: 't1', params }),
      );

      await waitFor(() => {
        expect(requestsTo(api, LIST_URL)).toBe(2);
        expect(requestsTo(api, ITEM_URL)).toBe(2);
      });
      expect(requestsTo(api, '/issuance-templates/t3')).toBe(1);
    },
  );

  test('delete refetches the list and drops the deleted template', async () => {
    const { api, store } = setup();
    await store.dispatch(getIssuanceTemplateList.initiate());
    // Opened before, no longer shown
    const single = store.dispatch(getIssuanceTemplate.initiate('t1'));
    await single;
    single.unsubscribe();

    await store.dispatch(deleteIssuanceTemplate({ templateId: 't1' }));

    await waitFor(() => expect(requestsTo(api, LIST_URL)).toBe(2));
    expect(requestsTo(api, ITEM_URL)).toBe(1);
    expect(cachedQueries(store)).toEqual([
      'getIssuanceTemplateList(undefined)',
    ]);
  });

  test('a failed write invalidates nothing', async () => {
    const { api, store } = setup();
    api.patch.mockRejectedValue(new Error('Network Error'));
    api.delete.mockRejectedValue(new Error('Network Error'));
    await subscribe(store);

    await store.dispatch(
      updateIssuanceTemplate({ templateId: 't1', params: {} }),
    );
    await store.dispatch(deleteIssuanceTemplate({ templateId: 't1' }));

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(requestsTo(api, LIST_URL)).toBe(1);
    expect(requestsTo(api, ITEM_URL)).toBe(1);
  });
});
