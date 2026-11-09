import toast from 'react-hot-toast';

import { ProtocolType } from '@/entities/Schema';
import { SchemaResponse } from '@/entities/Schema/model/types/schema';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import {
  createMockApi,
  createTestStore,
  MockApi,
} from '@/shared/lib/tests/renderWithProviders';

import { getIssuedCredentials } from './getIssuedCredentials';
import { revokeIssuedCredential } from './revokeIssuedCredential';
import {
  AnoncredsCredentialRecordResponse,
  IssuedCredential,
  OpenIdIssuanceSessionResponse,
} from '../types/issuedCredential';

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { error: jest.fn(), success: jest.fn() },
}));

const apiError = (status: number, message: string) => ({
  isAxiosError: true,
  response: { status, data: { message } },
});

const schemas: SchemaResponse[] = [
  {
    id: 'schema-passport',
    name: 'Passport',
    isHidden: false,
    orderIndex: 0,
    fields: [],
    registrations: [
      {
        schemaId: 'schema-passport',
        protocol: ProtocolType.Aries,
        credentialFormat: 'anoncreds',
        network: 'indy',
        did: 'did:indy:issuer',
        credentials: {
          issuerId: 'did:indy:issuer',
          schemaId: 'ledger-schema-1',
          credentialDefinitionId: 'creddef-passport',
        },
      },
    ],
  },
  {
    id: 'schema-diploma',
    name: 'Diploma',
    isHidden: true,
    orderIndex: 1,
    fields: [],
    registrations: [
      {
        schemaId: 'schema-diploma',
        protocol: ProtocolType.Oid4vc,
        credentialFormat: 'jwt_vc_json',
        network: 'key',
        did: 'did:key:issuer',
        credentials: {
          issuerId: 'issuer-1',
          supportedCredentialId: 'DiplomaJwt',
        },
      },
    ],
  },
];

// Server responses carry claims and secrets the store must never hold
const anoncredsRecords = [
  {
    id: 'cred-known',
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-02T10:00:00.000Z',
    state: 'done',
    role: 'issuer',
    revocable: true,
    revoked: false,
    credentialDefinitionId: 'creddef-passport',
    credentialAttributes: [{ name: 'firstName', value: 'Alice' }],
  },
  {
    id: 'cred-unknown-schema',
    createdAt: '2026-01-04T10:00:00.000Z',
    state: 'done',
    role: 'issuer',
    revocable: false,
    credentialDefinitionId: 'creddef-other',
  },
] as AnoncredsCredentialRecordResponse[];

const openIdSessions = [
  {
    id: 'session-jwt',
    createdAt: '2026-01-03T10:00:00.000Z',
    updatedAt: '2026-01-03T11:00:00.000Z',
    publicIssuerId: 'issuer-1',
    state: 'Completed',
    revocable: false,
    preAuthorizedCode: 'secret-pre-authorized-code',
    credentialOfferUri: 'https://issuer.example/offers/secret',
    issuanceMetadata: {
      credentials: [
        {
          format: 'jwt_vc_json',
          credentialSupportedId: 'DiplomaJwt',
          issuer: { did: 'did:key:issuer' },
          credentialSubject: { degree: 'secret-claim' },
          credentialStatus: { location: 'https://x/status/1', index: 3 },
        },
      ],
    },
    credentialOfferPayload: { credential_configuration_ids: ['DiplomaJwt'] },
  },
  {
    id: 'session-sd-jwt',
    createdAt: '2025-12-31T10:00:00.000Z',
    publicIssuerId: 'issuer-2',
    state: 'Completed',
    revocable: false,
    issuanceMetadata: {
      credentials: [
        { format: 'vc+sd-jwt', credentialSupportedId: 'UnknownSdJwt' },
      ],
    },
  },
] as OpenIdIssuanceSessionResponse[];

const routeGets = (api: MockApi) =>
  api.get.mockImplementation((url: string) => {
    if (url === agencyEndpoints.getAnoncredsCredentials)
      return Promise.resolve({ data: anoncredsRecords });
    if (url === agencyEndpoints.getOpenIdIssuanceSessions)
      return Promise.resolve({ data: openIdSessions });
    if (url === agencyEndpoints.getSchemaList)
      return Promise.resolve({ data: { items: schemas } });
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getIssuedCredentials', () => {
  test('requests finished issuances of both protocols and all schemas', async () => {
    const api = createMockApi();
    routeGets(api);
    const store = createTestStore({}, api);

    await store.dispatch(getIssuedCredentials());

    expect(api.get).toHaveBeenCalledWith(
      agencyEndpoints.getAnoncredsCredentials,
      { params: { role: 'issuer', state: 'done' } },
    );
    expect(api.get).toHaveBeenCalledWith(
      agencyEndpoints.getOpenIdIssuanceSessions,
      { params: { state: 'Completed' } },
    );
    // No isHidden filter: hidden schemas still name their credentials
    expect(api.get).toHaveBeenCalledWith(agencyEndpoints.getSchemaList);
  });

  test('merges both protocols newest first, with schema names and fallbacks', async () => {
    const api = createMockApi();
    routeGets(api);
    const store = createTestStore({}, api);

    await store.dispatch(getIssuedCredentials());

    const items = store.getState().issuedCredentials.items!;
    expect(items.map((item) => item.key)).toEqual([
      'Aries:cred-unknown-schema',
      'OpenId4VC:session-jwt',
      'Aries:cred-known',
      'OpenId4VC:session-sd-jwt',
    ]);
    expect(items.map((item) => item.name)).toEqual([
      'creddef-other',
      'Diploma',
      'Passport',
      'UnknownSdJwt',
    ]);
    expect(items[1]).toEqual<IssuedCredential>({
      key: 'OpenId4VC:session-jwt',
      id: 'session-jwt',
      protocol: ProtocolType.Oid4vc,
      name: 'Diploma',
      formats: ['jwt_vc_json'],
      issuedAt: '2026-01-03T11:00:00.000Z',
      issuerDid: 'did:key:issuer',
      credentialConfigurationIds: ['DiplomaJwt'],
      revocable: false,
    });
    expect(items[2]).toEqual<IssuedCredential>({
      key: 'Aries:cred-known',
      id: 'cred-known',
      protocol: ProtocolType.Aries,
      name: 'Passport',
      formats: ['anoncreds'],
      issuedAt: '2026-01-02T10:00:00.000Z',
      credentialDefinitionId: 'creddef-passport',
      revocable: true,
      revoked: false,
    });
  });

  test('takes revocable from the response, so OpenID4VC credentials are never revocable', async () => {
    const api = createMockApi();
    routeGets(api);
    const store = createTestStore({}, api);

    await store.dispatch(getIssuedCredentials());

    const items = store.getState().issuedCredentials.items!;
    const byKey = Object.fromEntries(items.map((item) => [item.key, item]));
    // jwt_vc_json has a status list entry in its metadata, but the server says it is not revocable
    expect(byKey['OpenId4VC:session-jwt'].revocable).toBe(false);
    expect(byKey['OpenId4VC:session-sd-jwt'].revocable).toBe(false);
    expect(byKey['Aries:cred-known'].revocable).toBe(true);
    expect(byKey['Aries:cred-unknown-schema'].revocable).toBe(false);
  });

  test('keeps claims, attributes and offer secrets out of the store', async () => {
    const api = createMockApi();
    routeGets(api);
    const store = createTestStore({}, api);

    await store.dispatch(getIssuedCredentials());

    const state = JSON.stringify(store.getState().issuedCredentials);
    for (const forbidden of [
      'issuanceMetadata',
      'credentialAttributes',
      'preAuthorizedCode',
      'credentialOfferUri',
      'credentialSubject',
      'credentialStatus',
      'secret',
      'Alice',
    ]) {
      expect(state).not.toContain(forbidden);
    }
  });

  test('a failing request shows the error and keeps no items', async () => {
    const api = createMockApi();
    routeGets(api);
    api.get.mockImplementation((url: string) =>
      url === agencyEndpoints.getOpenIdIssuanceSessions
        ? Promise.reject(apiError(500, 'Sessions unavailable'))
        : Promise.resolve({ data: [] }),
    );
    const store = createTestStore({}, api);

    await store.dispatch(getIssuedCredentials());

    const state = store.getState().issuedCredentials;
    expect(state.isLoading).toBe(false);
    expect(state.items).toBeUndefined();
    expect(state.error).toBe('Sessions unavailable');
    expect(toast.error).toHaveBeenCalledWith('Sessions unavailable');
  });
});

describe('revokeIssuedCredential', () => {
  const loadedStore = async (api: MockApi) => {
    routeGets(api);
    const store = createTestStore({}, api);
    await store.dispatch(getIssuedCredentials());
    return store;
  };

  const item = (store: Awaited<ReturnType<typeof loadedStore>>) =>
    store
      .getState()
      .issuedCredentials.items!.find((x) => x.key === 'Aries:cred-known')!;

  test('posts the revoke and marks the credential revoked', async () => {
    const api = createMockApi();
    const store = await loadedStore(api);
    api.post.mockResolvedValue({ data: undefined });

    const result = await store
      .dispatch(revokeIssuedCredential({ id: 'cred-known', key: 'Aries:cred-known' }))
      .unwrap();

    expect(api.post).toHaveBeenCalledWith('/credentials/cred-known/revoke');
    expect(result).toEqual({ key: 'Aries:cred-known', alreadyRevoked: false });
    expect(item(store).revoked).toBe(true);
    expect(store.getState().issuedCredentials.revokingKey).toBeUndefined();
    expect(toast.error).not.toHaveBeenCalled();
  });

  test('treats 409 as already revoked, without an error toast', async () => {
    const api = createMockApi();
    const store = await loadedStore(api);
    api.post.mockRejectedValue(apiError(409, 'Credential is already revoked.'));

    const result = await store
      .dispatch(revokeIssuedCredential({ id: 'cred-known', key: 'Aries:cred-known' }))
      .unwrap();

    expect(result).toEqual({ key: 'Aries:cred-known', alreadyRevoked: true });
    expect(item(store).revoked).toBe(true);
    expect(toast.error).not.toHaveBeenCalled();
  });

  test('shows the server message on other errors and keeps the status', async () => {
    const api = createMockApi();
    const store = await loadedStore(api);
    api.post.mockRejectedValue(apiError(500, 'Ledger update failed'));

    await expect(
      store
        .dispatch(revokeIssuedCredential({ id: 'cred-known', key: 'Aries:cred-known' }))
        .unwrap(),
    ).rejects.toBe('Ledger update failed');

    expect(toast.error).toHaveBeenCalledWith('Ledger update failed');
    expect(item(store).revoked).toBe(false);
    expect(store.getState().issuedCredentials.revokingKey).toBeUndefined();
  });

  test('tracks the credential being revoked while the request is in flight', async () => {
    const api = createMockApi();
    const store = await loadedStore(api);
    let resolvePost: (value: unknown) => void = () => undefined;
    api.post.mockReturnValue(
      new Promise((resolve) => {
        resolvePost = resolve;
      }),
    );

    const pending = store.dispatch(
      revokeIssuedCredential({ id: 'cred-known', key: 'Aries:cred-known' }),
    );
    expect(store.getState().issuedCredentials.revokingKey).toBe(
      'Aries:cred-known',
    );

    resolvePost({ data: undefined });
    await pending;
    expect(store.getState().issuedCredentials.revokingKey).toBeUndefined();
  });
});
