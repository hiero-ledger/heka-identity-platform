import toast from 'react-hot-toast';

import {
  getIssuanceTemplate as selectIssuanceTemplate,
  getIssuanceTemplates,
  getIssuanceTemplatesError,
  getIssuanceTemplatesIsLoading,
  getIssuanceTemplatesIsMutating,
} from '@/entities/IssuanceTemplate/model/selectors/issuanceTemplatesSelector';
import { issuanceTemplatesActions } from '@/entities/IssuanceTemplate/model/slices/issuanceTemplatesSlice';
import { IssuanceTemplate } from '@/entities/IssuanceTemplate/model/types/issuanceTemplate';
import {
  Openid4CredentialFormat,
  ProtocolType,
  Schema,
} from '@/entities/Schema/model/types/schema';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import {
  createMockApi,
  createTestStore,
} from '@/shared/lib/tests/renderWithProviders';

import { createIssuanceTemplate } from './createIssuanceTemplate';
import { deleteIssuanceTemplate } from './deleteIssuanceTemplate';
import { getIssuanceTemplate } from './getIssuanceTemplate';
import { getIssuanceTemplateList } from './getIssuanceTemplateList';
import { updateIssuanceTemplate } from './updateIssuanceTemplate';

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { error: jest.fn() },
}));

const apiError = (message: string) => ({
  isAxiosError: true,
  response: { status: 400, data: { message } },
});

const template = (id: string) => ({ id, name: id }) as IssuanceTemplate;

const schema: Schema = {
  id: 'schema-1',
  name: 'Passport',
  fields: [
    { id: 'f1', name: 'given_name' },
    { id: 'f2', name: 'family_name' },
  ],
};

const loaded = (templates: IssuanceTemplate[], current?: IssuanceTemplate) => ({
  issuanceTemplates: {
    isLoading: false,
    isMutating: false,
    issuanceTemplates: templates,
    issuanceTemplate: current,
  },
});

describe('getIssuanceTemplateList', () => {
  test('fetches with the paging params and stores the items', async () => {
    const api = createMockApi();
    api.get.mockResolvedValue({ data: { items: [template('t1')] } });
    const store = createTestStore({}, api);

    const pending = store.dispatch(getIssuanceTemplateList({ limit: 10 }));
    expect(getIssuanceTemplatesIsLoading(store.getState())).toBe(true);
    await pending;

    expect(api.get).toHaveBeenCalledWith(
      agencyEndpoints.getIssuanceTemplateList,
      { params: { limit: 10 } },
    );
    expect(getIssuanceTemplates(store.getState())).toEqual([template('t1')]);
    expect(getIssuanceTemplatesIsLoading(store.getState())).toBe(false);
  });

  test('stores the server message on failure', async () => {
    const api = createMockApi();
    api.get.mockRejectedValue(apiError('list failed'));
    const store = createTestStore(loaded([template('t1')]), api);

    await store.dispatch(getIssuanceTemplateList());

    expect(toast.error).toHaveBeenCalledWith('list failed');
    expect(getIssuanceTemplatesError(store.getState())).toBe('list failed');
    expect(getIssuanceTemplates(store.getState())).toBeUndefined();
  });
});

describe('getIssuanceTemplate', () => {
  test('stores the template', async () => {
    const api = createMockApi();
    api.get.mockResolvedValue({ data: template('t1') });
    const store = createTestStore({}, api);

    await store.dispatch(getIssuanceTemplate({ id: 't1' }));

    expect(api.get).toHaveBeenCalledWith(
      agencyEndpoints.getSingleIssuanceTemplate('t1'),
    );
    expect(selectIssuanceTemplate(store.getState())).toEqual(template('t1'));
  });

  test('clears the template on failure', async () => {
    const api = createMockApi();
    api.get.mockRejectedValue(apiError('not found'));
    const store = createTestStore(loaded([], template('t1')), api);

    await store.dispatch(getIssuanceTemplate({ id: 't1' }));

    expect(selectIssuanceTemplate(store.getState())).toBeUndefined();
    expect(getIssuanceTemplatesError(store.getState())).toBe('not found');
  });
});

describe('createIssuanceTemplate', () => {
  const params = {
    name: 'Gold',
    protocolType: ProtocolType.Oid4vc,
    credentialType: Openid4CredentialFormat.SdJwt,
    network: 'key',
    did: 'did:key:1',
    schema,
    credentialValues: { given_name: 'Ada', family_name: 'Lovelace' },
  };

  test('posts the template with a value per schema field and appends it', async () => {
    const api = createMockApi();
    api.post.mockResolvedValue({ data: template('new') });
    const store = createTestStore(loaded([template('t1')]), api);

    const pending = store.dispatch(createIssuanceTemplate(params));
    expect(getIssuanceTemplatesIsMutating(store.getState())).toBe(true);
    await pending;

    expect(api.post).toHaveBeenCalledWith(
      agencyEndpoints.createIssuanceTemplate,
      {
        name: 'Gold',
        protocol: ProtocolType.Oid4vc,
        credentialFormat: Openid4CredentialFormat.SdJwt,
        network: 'key',
        did: 'did:key:1',
        schemaId: 'schema-1',
        fields: [
          { schemaFieldId: 'f1', value: 'Ada' },
          { schemaFieldId: 'f2', value: 'Lovelace' },
        ],
      },
    );
    expect(getIssuanceTemplatesIsMutating(store.getState())).toBe(false);
    expect(getIssuanceTemplates(store.getState())).toEqual([
      template('t1'),
      template('new'),
    ]);
  });

  test('keeps the list and records a mutation error on failure', async () => {
    const api = createMockApi();
    api.post.mockRejectedValue(apiError('name taken'));
    const store = createTestStore(loaded([template('t1')]), api);

    const action = await store.dispatch(createIssuanceTemplate(params));

    expect(action.payload).toBe('name taken');
    expect(store.getState().issuanceTemplates).toMatchObject({
      isMutating: false,
      mutationError: 'name taken',
      issuanceTemplates: [template('t1')],
    });
    expect(getIssuanceTemplatesError(store.getState())).toBeUndefined();
  });
});

describe('updateIssuanceTemplate', () => {
  test('patches the fields built from the schema and values', async () => {
    const api = createMockApi();
    const store = createTestStore({}, api);

    await store.dispatch(
      updateIssuanceTemplate({
        templateId: 't1',
        params: {
          name: 'Renamed',
          schema,
          credentialValues: { given_name: 'Grace' },
          previousTemplateId: null,
        },
      }),
    );

    expect(api.patch).toHaveBeenCalledWith(
      agencyEndpoints.updateIssuanceTemplate('t1'),
      {
        name: 'Renamed',
        protocol: undefined,
        credentialFormat: undefined,
        network: undefined,
        did: undefined,
        schemaId: 'schema-1',
        fields: [
          { schemaFieldId: 'f1', value: 'Grace' },
          { schemaFieldId: 'f2', value: undefined },
        ],
        previousTemplateId: null,
      },
    );
  });

  test('leaves the fields out when only reordering', async () => {
    const api = createMockApi();
    const store = createTestStore({}, api);

    await store.dispatch(
      updateIssuanceTemplate({
        templateId: 't2',
        params: { previousTemplateId: 't1' },
      }),
    );

    expect(api.patch.mock.calls[0][1]).toMatchObject({
      fields: undefined,
      schemaId: undefined,
      previousTemplateId: 't1',
    });
  });

  test('rejects with the server message', async () => {
    const api = createMockApi();
    api.patch.mockRejectedValue(apiError('conflict'));
    const store = createTestStore({}, api);

    const action = await store.dispatch(
      updateIssuanceTemplate({ templateId: 't1', params: {} }),
    );

    expect(action.payload).toBe('conflict');
    expect(toast.error).toHaveBeenCalledWith('conflict');
  });
});

describe('deleteIssuanceTemplate', () => {
  test('removes the template from the list and clears it when open', async () => {
    const api = createMockApi();
    const store = createTestStore(
      loaded([template('t1'), template('t2')], template('t1')),
      api,
    );

    await store.dispatch(deleteIssuanceTemplate({ templateId: 't1' }));

    expect(api.delete).toHaveBeenCalledWith(
      agencyEndpoints.deleteIssuanceTemplate('t1'),
    );
    expect(getIssuanceTemplates(store.getState())).toEqual([template('t2')]);
    expect(selectIssuanceTemplate(store.getState())).toBeUndefined();
  });

  test('keeps another open template', async () => {
    const store = createTestStore(
      loaded([template('t1'), template('t2')], template('t2')),
    );

    await store.dispatch(deleteIssuanceTemplate({ templateId: 't1' }));

    expect(selectIssuanceTemplate(store.getState())).toEqual(template('t2'));
  });

  test('records a mutation error on failure', async () => {
    const api = createMockApi();
    api.delete.mockRejectedValue(apiError('in use'));
    const store = createTestStore(loaded([template('t1')]), api);

    await store.dispatch(deleteIssuanceTemplate({ templateId: 't1' }));

    expect(store.getState().issuanceTemplates).toMatchObject({
      isMutating: false,
      mutationError: 'in use',
      issuanceTemplates: [template('t1')],
    });
  });
});

describe('issuanceTemplatesSlice reducers', () => {
  test('updateIssuanceTemplate sets the open template and reset clears all', () => {
    const store = createTestStore(loaded([template('t1')]));

    store.dispatch(
      issuanceTemplatesActions.updateIssuanceTemplate(template('t9')),
    );
    expect(selectIssuanceTemplate(store.getState())).toEqual(template('t9'));

    store.dispatch(issuanceTemplatesActions.reset());
    expect(store.getState().issuanceTemplates).toEqual({
      isLoading: false,
      error: undefined,
      isMutating: false,
      mutationError: undefined,
      issuanceTemplates: undefined,
      issuanceTemplate: undefined,
    });
  });
});
