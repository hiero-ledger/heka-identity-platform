import toast from 'react-hot-toast';

import {
  getIsPresentationCompleted,
  getPresentationRequest,
  getPresentationRequestId,
  getPresentationRequestIsLoading,
  getPresentationSharedAttributes,
  getPresentationState,
} from '@/entities/Presentation/model/selectors/presentationSelector';
import { presentationActions } from '@/entities/Presentation/model/slices/presentationSlice';
import {
  AnoncredsPresentationState,
  OpenIdPresentationState,
} from '@/entities/Presentation/model/types/presentation';
import {
  AriesCredentialFormat,
  Openid4CredentialFormat,
  ProtocolType,
  Schema,
} from '@/entities/Schema/model/types/schema';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import * as tokenUtils from '@/shared/api/utils/token';
import {
  createMockApi,
  createTestStore,
} from '@/shared/lib/tests/renderWithProviders';

import { requestPresentation } from './requestPresentation';
import { updatePresentationState } from './updatePresentationState';

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { error: jest.fn() },
}));

jest.mock('@/const/user', () => ({
  ...jest.requireActual('@/const/user'),
  demoUser: { did: 'did:key:z6MkDemoUser' },
}));

const apiError = (message: string) => ({
  isAxiosError: true,
  response: { status: 400, data: { message } },
});

const schema: Schema = {
  id: 'schema-1',
  name: 'Passport',
  fields: [
    { id: 'f1', name: 'given_name' },
    { id: 'f2', name: 'family_name' },
  ],
  registrations: [
    {
      schemaId: 'schema-1',
      protocol: ProtocolType.Aries,
      credentialFormat: 'anoncreds',
      network: 'indy:test',
      did: 'did:indy:1',
      credentials: {
        issuerId: 'did:indy:1',
        schemaId: 'anon-schema',
        credentialDefinitionId: 'cred-def-1',
      },
    },
  ],
};

const withSession = (
  state: OpenIdPresentationState | AnoncredsPresentationState,
) => ({
  presentations: {
    isLoading: false,
    presentationSession: { id: 'p-1', request: 'openid4vp://x', state },
  },
});

const originalCredentials = Object.getOwnPropertyDescriptor(
  global.navigator,
  'credentials',
);

afterEach(() => {
  jest.restoreAllMocks();
  if (originalCredentials) {
    Object.defineProperty(global.navigator, 'credentials', originalCredentials);
  } else {
    delete (global.navigator as { credentials?: unknown }).credentials;
  }
});

describe('requestPresentation — OpenID4VP direct_post', () => {
  test('posts a PEX request signed with the user DID and stores the session', async () => {
    jest.spyOn(tokenUtils, 'getUserId').mockReturnValue('did:key:user');
    const api = createMockApi();
    api.post.mockResolvedValue({
      data: {
        authorizationRequest: 'openid4vp://request',
        verificationSession: {
          id: 'vs-1',
          state: OpenIdPresentationState.RequestCreated,
        },
      },
    });
    const store = createTestStore({}, api);

    const pending = store.dispatch(
      requestPresentation({
        protocolType: ProtocolType.Oid4vc,
        credentialType: Openid4CredentialFormat.SdJwt,
        schema,
      }),
    );
    expect(getPresentationRequestIsLoading(store.getState())).toBe(true);
    await pending;

    const [url, body] = api.post.mock.calls[0];
    expect(url).toBe(agencyEndpoints.requestOpenIdPresentation);
    expect(body.publicVerifierId).toBe('did:key:user');
    expect(body.requestSigner).toEqual({ method: 'did', did: 'did:key:user' });
    expect(
      body.presentationExchange.definition.input_descriptors[0].constraints
        .fields,
    ).toEqual([{ path: ['$.given_name'] }, { path: ['$.family_name'] }]);

    const state = store.getState();
    expect(getPresentationRequestIsLoading(state)).toBe(false);
    expect(getPresentationRequest(state)).toBe('openid4vp://request');
    expect(getPresentationRequestId(state)).toBe('vs-1');
    expect(getPresentationState(state)).toBe(
      OpenIdPresentationState.RequestCreated,
    );
    expect(getIsPresentationCompleted(state)).toBe(false);
  });

  test('asks only for the requested attributes, signed with the given DID, on the demo tenant', async () => {
    const api = createMockApi();
    const demoApi = createMockApi();
    demoApi.post.mockResolvedValue({
      data: {
        authorizationRequest: 'openid4vp://request',
        verificationSession: { id: 'vs-2', state: 'RequestCreated' },
      },
    });
    const store = createTestStore({}, api, demoApi);

    await store.dispatch(
      requestPresentation({
        protocolType: ProtocolType.Oid4vc,
        credentialType: Openid4CredentialFormat.SdJwt,
        schema,
        did: 'did:key:verifier',
        requestedAttributes: ['family_name'],
        useDemo: true,
      }),
    );

    expect(api.post).not.toHaveBeenCalled();
    const body = demoApi.post.mock.calls[0][1];
    expect(body.publicVerifierId).toBe('did:key:z6MkDemoUser');
    expect(body.requestSigner.did).toBe('did:key:verifier');
    expect(
      body.presentationExchange.definition.input_descriptors[0].constraints
        .fields,
    ).toEqual([{ path: ['$.family_name'] }]);
  });

  test('does not send a request when the user has no DID yet', async () => {
    jest.spyOn(tokenUtils, 'getUserId').mockReturnValue(null);
    const api = createMockApi();
    const store = createTestStore({}, api);

    const action = await store.dispatch(
      requestPresentation({
        protocolType: ProtocolType.Oid4vc,
        credentialType: Openid4CredentialFormat.SdJwt,
        schema,
      }),
    );

    expect(action.type).toBe('presentation/request/rejected');
    expect(api.post).not.toHaveBeenCalled();
  });

  test('rejects with the server message and clears the session', async () => {
    jest.spyOn(tokenUtils, 'getUserId').mockReturnValue('did:key:user');
    const api = createMockApi();
    api.post.mockRejectedValue(apiError('verifier missing'));
    const store = createTestStore(
      withSession(OpenIdPresentationState.ResponseVerified),
      api,
    );

    const action = await store.dispatch(
      requestPresentation({
        protocolType: ProtocolType.Oid4vc,
        credentialType: Openid4CredentialFormat.JwtJson,
        schema,
      }),
    );

    expect(action.payload).toBe('verifier missing');
    expect(toast.error).toHaveBeenCalledWith('verifier missing');
    expect(store.getState().presentations).toEqual({
      isLoading: false,
      error: 'verifier missing',
      presentationSession: undefined,
      latestRequestId: action.meta.requestId,
    });
  });
});

describe('requestPresentation — DC API errors', () => {
  const dcApiResponse = {
    data: {
      authorizationRequest: 'openid4vp://request',
      authorizationRequestObject: { response_mode: 'dc_api' },
      verificationSession: { id: 'vs-3', state: 'RequestCreated' },
    },
  };

  const failPicker = (error: unknown) =>
    Object.defineProperty(global.navigator, 'credentials', {
      value: { get: jest.fn().mockRejectedValue(error) },
      writable: true,
      configurable: true,
    });

  const namedError = (name: string) => {
    const error = new Error(name);
    error.name = name;
    return error;
  };

  test.each([
    ['NotAllowedError', 'cancelled'],
    ['AbortError', 'cancelled'],
    ['NotSupportedError', 'unsupported'],
    ['SecurityError', 'unsupported'],
    ['TypeError', 'failed'],
  ])('%s is reported inline as %s without a toast', async (name, code) => {
    jest.spyOn(tokenUtils, 'getUserId').mockReturnValue('did:key:user');
    failPicker(namedError(name));
    const api = createMockApi();
    api.post.mockResolvedValue(dcApiResponse);
    const store = createTestStore({}, api);

    const action = await store.dispatch(
      requestPresentation({
        protocolType: ProtocolType.Oid4vc,
        credentialType: Openid4CredentialFormat.SdJwt,
        schema,
        useDcApi: true,
      }),
    );

    expect(action.payload).toBe(code);
    expect(toast.error).not.toHaveBeenCalled();
    expect(store.getState().presentations.error).toBe(code);
  });

  test('a non-Error rejection is classified as failed', async () => {
    jest.spyOn(tokenUtils, 'getUserId').mockReturnValue('did:key:user');
    failPicker('boom');
    const api = createMockApi();
    api.post.mockResolvedValue(dcApiResponse);
    const store = createTestStore({}, api);

    const action = await store.dispatch(
      requestPresentation({
        protocolType: ProtocolType.Oid4vc,
        credentialType: Openid4CredentialFormat.SdJwt,
        schema,
        useDcApi: true,
      }),
    );

    expect(action.payload).toBe('failed');
  });

  test('does not open the picker when the user has no DID yet', async () => {
    jest.spyOn(tokenUtils, 'getUserId').mockReturnValue(null);
    const api = createMockApi();
    const store = createTestStore({}, api);

    const action = await store.dispatch(
      requestPresentation({
        protocolType: ProtocolType.Oid4vc,
        credentialType: Openid4CredentialFormat.SdJwt,
        schema,
        useDcApi: true,
      }),
    );

    expect(action.type).toBe('presentation/request/rejected');
    expect(api.post).not.toHaveBeenCalled();
  });
});

describe('requestPresentation — Aries', () => {
  test('posts an AnonCreds proof request bound to the credential definition', async () => {
    const api = createMockApi();
    api.post.mockResolvedValue({
      data: { id: 'proof-1', state: AnoncredsPresentationState.RequestSent },
    });
    const store = createTestStore({}, api);

    const action = await store.dispatch(
      requestPresentation({
        protocolType: ProtocolType.Aries,
        credentialType: AriesCredentialFormat.AnoncredsIndy,
        schema,
        connectionId: 'conn-1',
        requestedAttributes: ['given_name'],
      }),
    );

    expect(api.post).toHaveBeenCalledWith(
      agencyEndpoints.requestAnoncredsPresentation,
      {
        connectionId: 'conn-1',
        comment: 'Passport',
        request: {
          format: AriesCredentialFormat.AnoncredsIndy,
          name: 'Passport',
          proofParams: {
            attributes: [
              { name: 'given_name', credentialDefinitionId: 'cred-def-1' },
            ],
          },
        },
        requestNonRevokedProof: true,
      },
    );
    expect(action.payload).toEqual({
      id: 'proof-1',
      request: undefined,
      state: AnoncredsPresentationState.RequestSent,
    });
  });

  test('requests every schema field on the demo tenant by default', async () => {
    const api = createMockApi();
    const demoApi = createMockApi();
    demoApi.post.mockResolvedValue({
      data: { id: 'p', state: 'request-sent' },
    });
    const store = createTestStore({}, api, demoApi);

    await store.dispatch(
      requestPresentation({
        protocolType: ProtocolType.Aries,
        credentialType: AriesCredentialFormat.AnoncredsW3c,
        schema,
        useDemo: true,
      }),
    );

    expect(api.post).not.toHaveBeenCalled();
    const body = demoApi.post.mock.calls[0][1];
    expect(
      body.request.presentationExchange.input_descriptors[0].constraints.fields,
    ).toEqual([
      { path: ['$.credentialSubject.given_name'] },
      { path: ['$.credentialSubject.family_name'] },
    ]);
  });
});

describe('updatePresentationState', () => {
  test('OpenID4VP: maps the shared attributes of the verification session', async () => {
    const api = createMockApi();
    api.get.mockResolvedValue({
      data: {
        id: 'p-1',
        state: OpenIdPresentationState.ResponseVerified,
        sharedAttributes: { given_name: 'Ada' },
      },
    });
    const store = createTestStore(
      withSession(OpenIdPresentationState.RequestCreated),
      api,
    );

    await store.dispatch(
      updatePresentationState({ protocolType: ProtocolType.Oid4vc, id: 'p-1' }),
    );

    expect(api.get).toHaveBeenCalledWith(
      agencyEndpoints.updateOpenIdPresentationState('p-1'),
    );
    const state = store.getState();
    expect(getPresentationState(state)).toBe(
      OpenIdPresentationState.ResponseVerified,
    );
    expect(getPresentationSharedAttributes(state)).toEqual([
      { name: 'given_name', value: 'Ada' },
    ]);
    expect(getIsPresentationCompleted(state)).toBe(true);
  });

  test('OpenID4VP: leaves the attributes empty until the response arrives', async () => {
    const demoApi = createMockApi();
    demoApi.get.mockResolvedValue({
      data: { id: 'p-1', state: OpenIdPresentationState.RequestUriRetrieved },
    });
    const store = createTestStore(
      withSession(OpenIdPresentationState.RequestCreated),
      createMockApi(),
      demoApi,
    );

    const action = await store.dispatch(
      updatePresentationState({
        protocolType: ProtocolType.Oid4vc,
        id: 'p-1',
        useDemo: true,
      }),
    );

    expect(action.payload).toEqual({
      state: OpenIdPresentationState.RequestUriRetrieved,
      sharedAttributes: undefined,
    });
  });

  test('Aries: uses the revealed attributes of the proof record', async () => {
    const revealed = [{ name: 'given_name', value: 'Ada' }];
    const api = createMockApi();
    api.get.mockResolvedValue({
      data: {
        state: AnoncredsPresentationState.Done,
        revealedAttributes: revealed,
      },
    });
    const store = createTestStore(
      withSession(AnoncredsPresentationState.RequestSent),
      api,
    );

    await store.dispatch(
      updatePresentationState({ protocolType: ProtocolType.Aries, id: 'p-1' }),
    );

    expect(api.get).toHaveBeenCalledWith(
      agencyEndpoints.getAnoncredsPresentationState('p-1'),
    );
    expect(getPresentationSharedAttributes(store.getState())).toEqual(revealed);
    expect(getIsPresentationCompleted(store.getState())).toBe(true);
  });

  test('Aries on the demo tenant: presentation-received counts as completed', async () => {
    const api = createMockApi();
    const demoApi = createMockApi();
    demoApi.get.mockResolvedValue({
      data: { state: AnoncredsPresentationState.PresentationReceived },
    });
    const store = createTestStore(
      withSession(AnoncredsPresentationState.RequestSent),
      api,
      demoApi,
    );

    await store.dispatch(
      updatePresentationState({
        protocolType: ProtocolType.Aries,
        id: 'p-1',
        useDemo: true,
      }),
    );

    expect(api.get).not.toHaveBeenCalled();
    expect(getIsPresentationCompleted(store.getState())).toBe(true);
  });

  test('ignores a result when no session is open', async () => {
    const api = createMockApi();
    api.get.mockResolvedValue({ data: { state: 'done' } });
    const store = createTestStore({}, api);

    await store.dispatch(
      updatePresentationState({ protocolType: ProtocolType.Aries, id: 'p-1' }),
    );

    expect(store.getState().presentations.presentationSession).toBeUndefined();
  });

  test('rejects with the server message', async () => {
    const api = createMockApi();
    api.get.mockRejectedValue(apiError('session expired'));
    const store = createTestStore({}, api);

    const action = await store.dispatch(
      updatePresentationState({ protocolType: ProtocolType.Oid4vc, id: 'p-1' }),
    );

    expect(action.type).toBe('presentation/state/rejected');
    expect(action.payload).toBe('session expired');
  });
});

describe('presentationSlice reset', () => {
  test('returns to the initial state', () => {
    const store = createTestStore(
      withSession(OpenIdPresentationState.ResponseVerified),
    );

    store.dispatch(presentationActions.reset());

    expect(store.getState().presentations).toEqual({
      isLoading: false,
      error: undefined,
      presentationSession: undefined,
    });
  });
});
