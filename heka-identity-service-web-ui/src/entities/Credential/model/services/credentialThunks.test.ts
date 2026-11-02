import toast from 'react-hot-toast';

import {
  getCredentialOffer,
  getCredentialOfferId,
  getCredentialOfferIsLoading,
  getCredentialsConfig,
  getCredentialState,
  getIsCredentialSent,
} from '@/entities/Credential/model/selectors/credentialSelector';
import { credentialActions } from '@/entities/Credential/model/slices/credentialSlice';
import {
  AnoncredsCredentialState,
  OpenIdIssuanceState,
} from '@/entities/Credential/model/types/credential';
import {
  AriesCredentialFormat,
  Openid4CredentialFormat,
  ProtocolType,
  Schema,
} from '@/entities/Schema/model/types/schema';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import {
  createMockApi,
  createTestStore,
} from '@/shared/lib/tests/renderWithProviders';

import { getCredentialConfig } from './getCredentialConfig';
import { offerCredential, OfferCredentialParams } from './offerCredential';
import { updateCredentialState } from './updateCredentialState';

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { error: jest.fn() },
}));

const apiError = (message: string | string[]) => ({
  isAxiosError: true,
  response: { status: 400, data: { message } },
});

const schema: Schema = {
  id: 'schema-1',
  name: 'Passport',
  context: ['https://example.com/ctx'],
  fields: [
    { id: 'f1', name: 'given_name' },
    { id: 'f2', name: 'family_name' },
  ],
};

const oidParams: OfferCredentialParams = {
  protocolType: ProtocolType.Oid4vc,
  credentialType: Openid4CredentialFormat.SdJwt,
  schema,
  credentialValues: { given_name: 'Ada', family_name: 'Lovelace' },
  did: 'did:key:issuer',
  network: 'testnet',
};

const ariesParams: OfferCredentialParams = {
  protocolType: ProtocolType.Aries,
  credentialType: AriesCredentialFormat.AnoncredsIndy,
  schema,
  credentialValues: { given_name: 'Ada' },
  did: 'did:indy:issuer',
  network: 'indy:test',
  connectionId: 'conn-1',
};

describe('offerCredential', () => {
  test('OpenID4VC: reads the registration, posts the offer and stores the session', async () => {
    const api = createMockApi();
    api.get.mockResolvedValue({
      data: { credentials: { issuerId: 'i', supportedCredentialId: 'sc-1' } },
    });
    api.post.mockResolvedValue({
      data: {
        credentialOffer: 'openid-credential-offer://abc',
        issuanceSession: {
          id: 'sess-1',
          state: OpenIdIssuanceState.OfferCreated,
        },
      },
    });
    const store = createTestStore({}, api);

    const action = await store.dispatch(offerCredential(oidParams));

    expect(api.get).toHaveBeenCalledWith(
      agencyEndpoints.getSchemaRegistration('schema-1'),
      {
        params: {
          protocol: ProtocolType.Oid4vc,
          credentialFormat: 'vc+sd-jwt',
          did: 'did:key:issuer',
          network: 'testnet',
        },
      },
    );
    expect(api.post).toHaveBeenCalledWith(
      agencyEndpoints.offerOpenIdCredential,
      {
        publicIssuerId: 'did:key:issuer',
        preAuthorizedCodeFlowConfig: {},
        credentials: [
          {
            credentialSupportedId: 'sc-1',
            format: Openid4CredentialFormat.SdJwt,
            issuer: { did: 'did:key:issuer', method: 'did' },
            payload: oidParams.credentialValues,
            disclosureFrame: { _sd: ['given_name', 'family_name'] },
          },
        ],
      },
    );
    expect(action.payload).toEqual({
      id: 'sess-1',
      offer: 'openid-credential-offer://abc',
      state: OpenIdIssuanceState.OfferCreated,
    });
    const state = store.getState();
    expect(getCredentialOfferIsLoading(state)).toBe(false);
    expect(getCredentialOffer(state)).toBe('openid-credential-offer://abc');
    expect(getCredentialOfferId(state)).toBe('sess-1');
    expect(getCredentialState(state)).toBe(OpenIdIssuanceState.OfferCreated);
    expect(getIsCredentialSent(state)).toBe(false);
  });

  test('Aries: posts the attributes with the credential definition of the registration', async () => {
    const api = createMockApi();
    api.get.mockResolvedValue({
      data: { credentials: { credentialDefinitionId: 'cred-def-1' } },
    });
    api.post.mockResolvedValue({
      data: { id: 'cred-1', state: AnoncredsCredentialState.OfferSent },
    });
    const store = createTestStore({}, api);

    const action = await store.dispatch(offerCredential(ariesParams));

    expect(api.get.mock.calls[0][1].params.credentialFormat).toBe('anoncreds');
    expect(api.post).toHaveBeenCalledWith(
      agencyEndpoints.offerAnoncredsCredential,
      {
        connectionId: 'conn-1',
        credentialDefinitionId: 'cred-def-1',
        attributes: [{ name: 'given_name', value: 'Ada' }],
        format: AriesCredentialFormat.AnoncredsIndy,
        comment: 'Passport',
      },
    );
    expect(action.payload).toEqual({
      id: 'cred-1',
      offer: undefined,
      state: AnoncredsCredentialState.OfferSent,
    });
    expect(getIsCredentialSent(store.getState())).toBe(true);
  });

  test.each([ProtocolType.Oid4vc, ProtocolType.Aries])(
    '%s offers from the demo tenant when useDemo is set',
    async (protocolType) => {
      const api = createMockApi();
      const demoApi = createMockApi();
      demoApi.get.mockResolvedValue({
        data: {
          credentials: {
            supportedCredentialId: 'sc-1',
            credentialDefinitionId: 'cred-def-1',
          },
        },
      });
      demoApi.post.mockResolvedValue({
        data: { id: 'x', state: 'offer-sent', issuanceSession: { id: 'x' } },
      });
      const store = createTestStore({}, api, demoApi);

      await store.dispatch(
        offerCredential({
          ...(protocolType === ProtocolType.Aries ? ariesParams : oidParams),
          useDemo: true,
        }),
      );

      expect(api.get).not.toHaveBeenCalled();
      expect(api.post).not.toHaveBeenCalled();
      expect(demoApi.post).toHaveBeenCalled();
    },
  );

  test.each([
    [
      ProtocolType.Oid4vc,
      oidParams,
      'Schema registration has no supported credential for OpenID4VC issuance',
    ],
    [
      ProtocolType.Aries,
      ariesParams,
      'Schema registration has no credential definition',
    ],
  ])(
    '%s: rejects without posting when the registration lacks the credential id',
    async (_protocol, params, message) => {
      const api = createMockApi();
      api.get.mockResolvedValue({ data: { credentials: { issuerId: 'i' } } });
      const store = createTestStore({}, api);

      const action = await store.dispatch(offerCredential(params));

      expect(api.post).not.toHaveBeenCalled();
      expect(action.payload).toBe(message);
      expect(toast.error).toHaveBeenCalledWith(message);
    },
  );

  test('rejects with the server message and clears the session', async () => {
    const api = createMockApi();
    api.get.mockRejectedValue(apiError(['bad did', 'bad network']));
    const store = createTestStore(
      {
        credentials: {
          isLoading: false,
          issuanceSession: { id: 'old', state: OpenIdIssuanceState.Completed },
        },
      },
      api,
    );

    const action = await store.dispatch(offerCredential(oidParams));

    expect(action.type).toBe('credentials/offer/rejected');
    expect(action.payload).toBe('bad did, bad network');
    expect(toast.error).toHaveBeenCalledWith('bad did, bad network');
    expect(store.getState().credentials).toEqual({
      isLoading: false,
      error: 'bad did, bad network',
      issuanceSession: undefined,
      credentialsConfig: undefined,
      offerRequestId: action.meta.requestId,
    });
  });

  test('marks the request as loading while it is in flight', async () => {
    const api = createMockApi();
    let release: (value: unknown) => void = () => {};
    api.get.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const store = createTestStore({}, api);

    const pending = store.dispatch(offerCredential(oidParams));
    expect(getCredentialOfferIsLoading(store.getState())).toBe(true);

    release({ data: undefined });
    await pending;
    expect(getCredentialOfferIsLoading(store.getState())).toBe(false);
  });
});

describe('updateCredentialState', () => {
  const withSession = (state: OpenIdIssuanceState | AnoncredsCredentialState) =>
    ({
      credentials: { isLoading: false, issuanceSession: { id: 's-1', state } },
    }) as const;

  test('OpenID4VC: polls the issuance session and updates its state', async () => {
    const api = createMockApi();
    api.get.mockResolvedValue({
      data: { state: OpenIdIssuanceState.Completed },
    });
    const store = createTestStore(
      withSession(OpenIdIssuanceState.OfferCreated),
      api,
    );

    const action = await store.dispatch(
      updateCredentialState({ protocolType: ProtocolType.Oid4vc, id: 's-1' }),
    );

    expect(api.get).toHaveBeenCalledWith(
      agencyEndpoints.updateOpenIdCredentialState('s-1'),
    );
    expect(action.payload).toEqual({ state: OpenIdIssuanceState.Completed });
    expect(getCredentialState(store.getState())).toBe(
      OpenIdIssuanceState.Completed,
    );
    expect(getIsCredentialSent(store.getState())).toBe(true);
  });

  test('Aries: polls the credential record on the demo tenant', async () => {
    const api = createMockApi();
    const demoApi = createMockApi();
    demoApi.get.mockResolvedValue({
      data: { state: AnoncredsCredentialState.Done },
    });
    const store = createTestStore(
      withSession(AnoncredsCredentialState.OfferSent),
      api,
      demoApi,
    );

    await store.dispatch(
      updateCredentialState({
        protocolType: ProtocolType.Aries,
        id: 's-1',
        useDemo: true,
      }),
    );

    expect(api.get).not.toHaveBeenCalled();
    expect(demoApi.get).toHaveBeenCalledWith(
      agencyEndpoints.getAnoncredsCredentialState('s-1'),
    );
    expect(getCredentialState(store.getState())).toBe(
      AnoncredsCredentialState.Done,
    );
  });

  test('ignores a result when no session is open', async () => {
    const api = createMockApi();
    api.get.mockResolvedValue({
      data: { state: OpenIdIssuanceState.Completed },
    });
    const store = createTestStore({}, api);

    await store.dispatch(
      updateCredentialState({ protocolType: ProtocolType.Aries, id: 's-1' }),
    );

    expect(store.getState().credentials.issuanceSession).toBeUndefined();
  });

  test('rejects with the server message', async () => {
    const api = createMockApi();
    api.get.mockRejectedValue(apiError('gone'));
    const store = createTestStore({}, api);

    const action = await store.dispatch(
      updateCredentialState({ protocolType: ProtocolType.Oid4vc, id: 's-1' }),
    );

    expect(action.payload).toBe('gone');
    expect(toast.error).toHaveBeenCalledWith('gone');
  });

  test.each([
    [AnoncredsCredentialState.RequestReceived, true],
    [AnoncredsCredentialState.CredentialIssued, true],
    [AnoncredsCredentialState.Abandoned, false],
  ])('getIsCredentialSent(%s) is %s', (state, expected) => {
    const store = createTestStore(withSession(state));
    expect(getIsCredentialSent(store.getState())).toBe(expected);
  });
});

describe('getCredentialConfig', () => {
  test('stores the credential config', async () => {
    const config = {
      Aries: { credentials: ['anoncreds-indy'], networks: ['indy:test'] },
    };
    const api = createMockApi();
    api.get.mockResolvedValue({ data: config });
    const store = createTestStore({}, api);

    await store.dispatch(getCredentialConfig());

    expect(api.get).toHaveBeenCalledWith(agencyEndpoints.getCredentialConfig);
    expect(getCredentialsConfig(store.getState())).toEqual(config);
  });

  test('rejects with the server message', async () => {
    const api = createMockApi();
    api.get.mockRejectedValue(apiError('no config'));
    const store = createTestStore({}, api);

    const action = await store.dispatch(getCredentialConfig());

    expect(action.type).toBe('credentials/config/rejected');
    expect(action.payload).toBe('no config');
  });
});

describe('credentialSlice reset', () => {
  test('returns to the initial state', () => {
    const store = createTestStore({
      credentials: {
        isLoading: true,
        error: 'x',
        issuanceSession: { id: 's', state: OpenIdIssuanceState.Completed },
        credentialsConfig: {},
      },
    });

    store.dispatch(credentialActions.reset());

    expect(store.getState().credentials).toEqual({
      isLoading: false,
      error: undefined,
      issuanceSession: undefined,
      credentialsConfig: undefined,
    });
  });
});
