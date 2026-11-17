import toast from 'react-hot-toast';

import {
  getSchema,
  selectSchemaLoading,
} from '@/entities/Schema/model/selectors/schemasSelector';
import { schemasActions } from '@/entities/Schema/model/slices/schemasSlice';
import { Schema } from '@/entities/Schema/model/types/schema';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import {
  createMockApi,
  createTestStore,
} from '@/shared/lib/tests/renderWithProviders';

import { changeSchemaVisibility } from './changeSchemaVisibility';
import { createNewSchema } from './createSchema';
import { registerSchema } from './registerSchema';
import { updateSchema } from './updateSchema';
import { updateSchemaView } from './updateSchemaView';

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { error: jest.fn() },
}));

const apiError = (message: string) => ({
  isAxiosError: true,
  response: { status: 400, data: { message } },
});

const schema = (id: string, extra: Partial<Schema> = {}): Schema => ({
  id,
  name: `Schema ${id}`,
  fields: [{ id: `${id}-f`, name: 'name' }],
  ...extra,
});

const formEntries = (formData: FormData) =>
  Object.fromEntries(Array.from(formData.entries()));

const loadedState = (current?: Schema) => ({
  schemas: { isLoading: false, schema: current },
});

describe('createNewSchema', () => {
  test('posts the form and returns the created schema', async () => {
    const api = createMockApi();
    api.post.mockResolvedValue({ data: schema('new') });
    const store = createTestStore({}, api);
    const form = new FormData();
    form.append('name', 'New');

    const action = await store.dispatch(createNewSchema(form));

    expect(api.post).toHaveBeenCalledWith(agencyEndpoints.createSchema, form);
    expect(action.payload).toEqual(schema('new'));
    expect(store.getState().schemas.isLoading).toBe(false);
  });

  test('stores the error on failure', async () => {
    const api = createMockApi();
    api.post.mockRejectedValue(apiError('name taken'));
    const store = createTestStore({}, api);

    await store.dispatch(createNewSchema(new FormData()));

    expect(store.getState().schemas).toMatchObject({
      isLoading: false,
      error: 'name taken',
    });
  });
});

describe('registerSchema', () => {
  const registration = {
    schemaId: 's1',
    protocol: 'Aries',
    credentialFormat: 'anoncreds',
    network: 'indy:test',
    did: 'did:indy:1',
  };

  test('registers, re-reads the schema once and stores it as the current schema', async () => {
    const registered = schema('s1', { registrationsCount: 1 });
    const api = createMockApi();
    api.get.mockResolvedValue({ data: registered });
    const store = createTestStore(loadedState(schema('s1')), api);

    const action = await store.dispatch(registerSchema(registration));

    expect(api.post).toHaveBeenCalledWith(
      agencyEndpoints.registerSchema('s1'),
      {
        protocol: 'Aries',
        credentialFormat: 'anoncreds',
        network: 'indy:test',
        did: 'did:indy:1',
      },
    );
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith(agencyEndpoints.getSingleSchema('s1'));
    expect(action.payload).toEqual(registered);
    expect(getSchema(store.getState())).toEqual(registered);
    expect(selectSchemaLoading(store.getState())).toBe(false);
  });

  test('stores the error on failure', async () => {
    const api = createMockApi();
    api.post.mockRejectedValue(apiError('ledger down'));
    const store = createTestStore({}, api);

    const action = await store.dispatch(registerSchema(registration));

    expect(action.payload).toBe('ledger down');
    expect(store.getState().schemas.error).toBe('ledger down');
  });
});

describe('updateSchemaView', () => {
  test('patches logo and colour and returns the stored logo', async () => {
    const api = createMockApi();
    api.patch.mockResolvedValue({ data: { logo: '/logos/s1.png' } });
    const store = createTestStore({}, api);
    const logo = new File(['x'], 'logo.png', { type: 'image/png' });

    const action = await store.dispatch(
      updateSchemaView({ schemaId: 's1', params: { logo, bgColor: '#fff' } }),
    );

    const [url, form] = api.patch.mock.calls[0];
    expect(url).toBe(agencyEndpoints.updateSchema('s1'));
    expect(Object.keys(formEntries(form))).toEqual(['logo', 'bgColor']);
    expect(formEntries(form).bgColor).toBe('#fff');
    expect(action.payload).toEqual({
      schemaId: 's1',
      params: { logo: '/logos/s1.png', bgColor: '#fff' },
    });
    expect(selectSchemaLoading(store.getState())).toBe(false);
  });

  test('sends only the values that are set', async () => {
    const api = createMockApi();
    api.patch.mockResolvedValue({ data: {} });
    const store = createTestStore({}, api);

    await store.dispatch(updateSchemaView({ schemaId: 's1', params: {} }));

    expect(formEntries(api.patch.mock.calls[0][1])).toEqual({});
  });

  test('stores the error on failure', async () => {
    const api = createMockApi();
    api.patch.mockRejectedValue(apiError('too large'));
    const store = createTestStore({}, api);

    await store.dispatch(
      updateSchemaView({ schemaId: 's1', params: { bgColor: '#fff' } }),
    );

    expect(store.getState().schemas).toMatchObject({
      isLoading: false,
      error: 'too large',
    });
  });
});

describe('updateSchema', () => {
  test.each([
    [
      { prevSchemaId: 's0', isHidden: true },
      { previousSchemaId: 's0', isHidden: 'true' },
    ],
    [{ prevSchemaId: null as unknown as string }, { previousSchemaId: 'null' }],
    [{ isHidden: false }, { isHidden: 'false' }],
    [{}, {}],
  ])('sends %j as %j', async (params, expected) => {
    const api = createMockApi();
    const store = createTestStore({}, api);

    await store.dispatch(updateSchema({ schemaId: 's1', params }));

    expect(api.patch.mock.calls[0][0]).toBe(agencyEndpoints.updateSchema('s1'));
    expect(formEntries(api.patch.mock.calls[0][1])).toEqual(expected);
  });

  test('rejects with the server message', async () => {
    const api = createMockApi();
    api.patch.mockRejectedValue(apiError('conflict'));
    const store = createTestStore({}, api);

    const action = await store.dispatch(
      updateSchema({ schemaId: 's1', params: { isHidden: true } }),
    );

    expect(action.payload).toBe('conflict');
    expect(toast.error).toHaveBeenCalledWith('conflict');
  });
});

describe('changeSchemaVisibility', () => {
  test('patches the hidden flag', async () => {
    const api = createMockApi();
    const store = createTestStore({}, api);

    const action = await store.dispatch(
      changeSchemaVisibility({ schemaId: 's1', params: { isHidden: true } }),
    );

    expect(action.type).toBe('schema/changeSchemaVisibility/fulfilled');
    expect(api.patch.mock.calls[0][0]).toBe(agencyEndpoints.updateSchema('s1'));
    expect(formEntries(api.patch.mock.calls[0][1])).toEqual({
      isHidden: 'true',
    });
  });

  test('rejects with the server message', async () => {
    const api = createMockApi();
    api.patch.mockRejectedValue(apiError('forbidden'));
    const store = createTestStore({}, api);

    const action = await store.dispatch(
      changeSchemaVisibility({ schemaId: 's1', params: { isHidden: false } }),
    );

    expect(action.payload).toBe('forbidden');
  });
});

describe('schemasSlice reducers', () => {
  test('updateSchema replaces the current schema and reset clears everything', () => {
    const store = createTestStore(loadedState(schema('s1')));

    store.dispatch(schemasActions.updateSchema(schema('s2')));
    expect(getSchema(store.getState())).toEqual(schema('s2'));

    store.dispatch(schemasActions.reset());
    expect(store.getState().schemas).toEqual({
      isLoading: false,
      error: undefined,
      schema: undefined,
    });
  });
});
