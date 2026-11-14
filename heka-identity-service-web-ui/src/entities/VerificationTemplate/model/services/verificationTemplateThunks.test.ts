import toast from 'react-hot-toast';

import {
  Openid4CredentialFormat,
  ProtocolType,
  Schema,
} from '@/entities/Schema/model/types/schema';
import { getVerificationTemplatesIsMutating } from '@/entities/VerificationTemplate/model/selectors/verificationTemplatesSelector';
import { verificationTemplatesActions } from '@/entities/VerificationTemplate/model/slices/verificationTemplatesSlice';
import { VerificationTemplate } from '@/entities/VerificationTemplate/model/types/verificationTemplate';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import {
  createMockApi,
  createTestStore,
} from '@/shared/lib/tests/renderWithProviders';

import { createVerificationTemplate } from './createVerificationTemplate';
import { deleteVerificationTemplate } from './deleteVerificationTemplate';
import { updateVerificationTemplate } from './updateVerificationTemplate';

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { error: jest.fn() },
}));

const apiError = (message: string) => ({
  isAxiosError: true,
  response: { status: 400, data: { message } },
});

const template = (id: string) => ({ id, name: id }) as VerificationTemplate;

const schema: Schema = {
  id: 'schema-1',
  name: 'Passport',
  fields: [
    { id: 'f1', name: 'given_name' },
    { id: 'f2', name: 'family_name' },
  ],
};

const mutating = (mutationError?: string) => ({
  verificationTemplates: { isMutating: false, mutationError },
});

describe('createVerificationTemplate', () => {
  const params = {
    name: 'Age check',
    protocolType: ProtocolType.Oid4vc,
    credentialType: Openid4CredentialFormat.SdJwt,
    network: 'key',
    did: 'did:key:1',
    schema,
    attributes: ['family_name'],
  };

  test('posts the requested attributes as schema field ids', async () => {
    const api = createMockApi();
    api.post.mockResolvedValue({ data: template('new') });
    const store = createTestStore(mutating(), api);

    const pending = store.dispatch(createVerificationTemplate(params));
    expect(getVerificationTemplatesIsMutating(store.getState())).toBe(true);
    await pending;

    expect(api.post).toHaveBeenCalledWith(
      agencyEndpoints.createVerificationTemplate,
      {
        name: 'Age check',
        protocol: ProtocolType.Oid4vc,
        credentialFormat: Openid4CredentialFormat.SdJwt,
        network: 'key',
        did: 'did:key:1',
        schemaId: 'schema-1',
        fields: [{ schemaFieldId: 'f2' }],
      },
    );
    expect(getVerificationTemplatesIsMutating(store.getState())).toBe(false);
  });

  test('rejects without posting when an attribute is not a schema field', async () => {
    const api = createMockApi();
    const store = createTestStore(mutating(), api);

    const action = await store.dispatch(
      createVerificationTemplate({ ...params, attributes: ['birth_date'] }),
    );

    expect(api.post).not.toHaveBeenCalled();
    expect(action.payload).toBe(
      'Attribute "birth_date" is not a field of schema "Passport"',
    );
  });

  test('records a mutation error on failure', async () => {
    const api = createMockApi();
    api.post.mockRejectedValue(apiError('name taken'));
    const store = createTestStore(mutating(), api);

    await store.dispatch(createVerificationTemplate(params));

    expect(store.getState().verificationTemplates).toMatchObject({
      isMutating: false,
      mutationError: 'name taken',
    });
  });
});

describe('updateVerificationTemplate', () => {
  test('patches the attributes as schema field ids', async () => {
    const api = createMockApi();
    const store = createTestStore({}, api);

    await store.dispatch(
      updateVerificationTemplate({
        templateId: 't1',
        params: {
          name: 'Renamed',
          protocolType: ProtocolType.Oid4vc,
          credentialType: Openid4CredentialFormat.JwtJson,
          network: 'key',
          did: 'did:key:1',
          schema,
          attributes: ['given_name', 'family_name'],
        },
      }),
    );

    expect(api.patch).toHaveBeenCalledWith(
      agencyEndpoints.updateVerificationTemplate('t1'),
      {
        name: 'Renamed',
        protocol: ProtocolType.Oid4vc,
        credentialFormat: Openid4CredentialFormat.JwtJson,
        network: 'key',
        did: 'did:key:1',
        schemaId: 'schema-1',
        fields: [{ schemaFieldId: 'f1' }, { schemaFieldId: 'f2' }],
        previousTemplateId: undefined,
      },
    );
  });

  test('rejects without patching when an attribute is not a schema field', async () => {
    const api = createMockApi();
    const store = createTestStore({}, api);

    const action = await store.dispatch(
      updateVerificationTemplate({
        templateId: 't1',
        params: { schema, attributes: ['given_name', 'birth_date'] },
      }),
    );

    expect(api.patch).not.toHaveBeenCalled();
    expect(action.payload).toBe(
      'Attribute "birth_date" is not a field of schema "Passport"',
    );
  });

  test('leaves the fields out when only reordering', async () => {
    const api = createMockApi();
    const store = createTestStore({}, api);

    await store.dispatch(
      updateVerificationTemplate({
        templateId: 't2',
        params: { previousTemplateId: null },
      }),
    );

    expect(api.patch.mock.calls[0][1]).toMatchObject({
      fields: undefined,
      previousTemplateId: null,
    });
  });

  test('rejects with the server message', async () => {
    const api = createMockApi();
    api.patch.mockRejectedValue(apiError('conflict'));
    const store = createTestStore({}, api);

    const action = await store.dispatch(
      updateVerificationTemplate({ templateId: 't1', params: {} }),
    );

    expect(action.payload).toBe('conflict');
  });
});

describe('deleteVerificationTemplate', () => {
  test('deletes the template', async () => {
    const api = createMockApi();
    const store = createTestStore(mutating(), api);

    const action = await store.dispatch(
      deleteVerificationTemplate({ templateId: 't1' }),
    );

    expect(api.delete).toHaveBeenCalledWith(
      agencyEndpoints.deleteVerificationTemplate('t1'),
    );
    expect(action.payload).toEqual({ templateId: 't1' });
    expect(getVerificationTemplatesIsMutating(store.getState())).toBe(false);
  });

  test('rejects with the server message', async () => {
    const api = createMockApi();
    api.delete.mockRejectedValue(apiError('in use'));
    const store = createTestStore({}, api);

    const action = await store.dispatch(
      deleteVerificationTemplate({ templateId: 't1' }),
    );

    expect(action.payload).toBe('in use');
    expect(toast.error).toHaveBeenCalledWith('in use');
  });
});

describe('verificationTemplatesSlice reducers', () => {
  test('reset clears the mutation state', () => {
    const store = createTestStore({
      verificationTemplates: { isMutating: true, mutationError: 'x' },
    });

    store.dispatch(verificationTemplatesActions.reset());

    expect(store.getState().verificationTemplates).toEqual({
      isMutating: false,
      mutationError: undefined,
    });
  });
});
