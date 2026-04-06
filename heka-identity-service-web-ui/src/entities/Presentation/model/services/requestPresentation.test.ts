import { AxiosInstance } from 'axios';

import { demoUser } from '@/const/user';
import { OpenIdPresentationState } from '@/entities/Presentation/model/types/presentation';
import { Openid4CredentialFormat, ProtocolType } from '@/entities/Schema/model/types/schema';
import * as tokenUtils from '@/shared/api/utils/token';

// Pull out the internal DC API function via the thunk's underlying helpers by
// testing `requestPresentation` with a mocked axios and browser API.
import { RequestPresentationParams, requestPresentation } from './requestPresentation';

// ─── helpers ────────────────────────────────────────────────────────────────

const makeApi = (postResponse: unknown): AxiosInstance =>
  ({
    post: jest.fn().mockResolvedValue({ data: postResponse }),
  } as unknown as AxiosInstance);

const baseSchema = {
  id: 'schema-1',
  name: 'TestSchema',
  fields: [{ name: 'age' }, { name: 'name' }],
} as any;

const baseParams: RequestPresentationParams = {
  protocolType: ProtocolType.Oid4vc,
  credentialType: Openid4CredentialFormat.SdJwt,
  schema: baseSchema,
  useDcApi: true,
};

// ─── navigator.credentials mock setup ───────────────────────────────────────

// The production code checks `credentialResponse.constructor.name !== 'DigitalCredential'`,
// so the mock class must be named exactly `DigitalCredential`.
// eslint-disable-next-line @typescript-eslint/naming-convention
const DigitalCredential = class DigitalCredential {
  public data: string | Record<string, unknown>;
  constructor(data: string | Record<string, unknown>) {
    this.data = data;
  }
};

const mockNavigatorCredentials = (response: unknown) => {
  Object.defineProperty(global.navigator, 'credentials', {
    value: { get: jest.fn().mockResolvedValue(response) },
    writable: true,
    configurable: true,
  });
};

// ─── thunk test harness ──────────────────────────────────────────────────────

const runThunk = async (params: RequestPresentationParams, agencyApi: AxiosInstance) => {
  let result: any;
  let error: any;

  const dispatch = jest.fn((action: any) => {
    if (action instanceof Promise || typeof action === 'function') return action;
    return action;
  });

  const thunk = requestPresentation(params);
  const returnValue = await thunk(
    dispatch,
    () => ({}),
    { agencyApi, agencyDemoApi: agencyApi, authApi: {} as any },
  );

  if (returnValue?.error) {
    error = returnValue.payload;
  } else {
    result = returnValue?.payload;
  }

  return { result, error };
};

// ─── tests ───────────────────────────────────────────────────────────────────

describe('requestPresentation — DC API flow', () => {
  beforeEach(() => {
    jest.spyOn(tokenUtils, 'getUserId').mockReturnValue('did:key:z6MkTestUser');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('calls navigator.credentials.get with unsigned protocol when authorizationRequestObject has no payload', async () => {
    const authorizationRequestObject = { response_mode: 'dc_api', nonce: 'abc', client_id: 'v-1' };
    const credential = new DigitalCredential(JSON.stringify({ vp_token: 'tok' }));

    const api = makeApi({
      authorizationRequest: 'openid4vp://...',
      authorizationRequestObject,
      verificationSession: { id: 'sess-1', state: OpenIdPresentationState.RequestCreated },
    });
    mockNavigatorCredentials(credential);

    const { result } = await runThunk(baseParams, api);

    expect(navigator.credentials.get).toHaveBeenCalledWith(
      expect.objectContaining({
        digital: expect.objectContaining({
          requests: [expect.objectContaining({ protocol: 'openid4vp-v1-unsigned' })],
        }),
      }),
    );
    expect(result?.state).toBe(OpenIdPresentationState.ResponseVerified);
    expect(result?.id).toBe('sess-1');
  });

  it('calls navigator.credentials.get with signed protocol when authorizationRequestObject has a payload field', async () => {
    const authorizationRequestObject = { payload: 'signed.jwt.here', header: {} };
    const credential = new DigitalCredential({ vp_token: 'tok' });

    const api = makeApi({
      authorizationRequest: 'openid4vp://...',
      authorizationRequestObject,
      verificationSession: { id: 'sess-2', state: OpenIdPresentationState.RequestCreated },
    });
    mockNavigatorCredentials(credential);

    await runThunk(baseParams, api);

    expect(navigator.credentials.get).toHaveBeenCalledWith(
      expect.objectContaining({
        digital: expect.objectContaining({
          requests: [expect.objectContaining({ protocol: 'openid4vp-v1-signed' })],
        }),
      }),
    );
  });

  it('posts the parsed JSON response to the verify endpoint when credential.data is a string', async () => {
    const authorizationRequestObject = { response_mode: 'dc_api', nonce: 'abc' };
    const vpToken = { vp_token: 'tok', state: 's1' };
    const credential = new DigitalCredential(JSON.stringify(vpToken));

    const api = makeApi({
      authorizationRequest: 'openid4vp://...',
      authorizationRequestObject,
      verificationSession: { id: 'sess-3', state: OpenIdPresentationState.RequestCreated },
    });
    mockNavigatorCredentials(credential);

    await runThunk(baseParams, api);

    // Second call is the verify POST
    const [, verifyCall] = (api.post as jest.Mock).mock.calls;
    expect(verifyCall[0]).toMatch(/sess-3\/verify/);
    expect(verifyCall[1]).toEqual(
      expect.objectContaining({
        authorizationResponse: vpToken,
        origin: window.location.origin,
      }),
    );
  });

  it('posts the raw object when credential.data is already an object', async () => {
    const authorizationRequestObject = { response_mode: 'dc_api', nonce: 'xyz' };
    const vpToken = { vp_token: 'tok2' };
    const credential = new DigitalCredential(vpToken);

    const api = makeApi({
      authorizationRequest: 'openid4vp://...',
      authorizationRequestObject,
      verificationSession: { id: 'sess-4', state: OpenIdPresentationState.RequestCreated },
    });
    mockNavigatorCredentials(credential);

    await runThunk(baseParams, api);

    const [, verifyCall] = (api.post as jest.Mock).mock.calls;
    expect(verifyCall[1].authorizationResponse).toEqual(vpToken);
  });

  it('rejects when navigator.credentials.get returns null', async () => {
    const api = makeApi({
      authorizationRequest: 'openid4vp://...',
      authorizationRequestObject: { response_mode: 'dc_api', nonce: 'abc' },
      verificationSession: { id: 'sess-5', state: OpenIdPresentationState.RequestCreated },
    });
    mockNavigatorCredentials(null);

    const { result, error } = await runThunk(baseParams, api);
    expect(result).toBeUndefined();
    expect(error).toBeDefined();
  });

  it('rejects when navigator.credentials.get returns a non-DigitalCredential type', async () => {
    const api = makeApi({
      authorizationRequest: 'openid4vp://...',
      authorizationRequestObject: { response_mode: 'dc_api', nonce: 'abc' },
      verificationSession: { id: 'sess-6', state: OpenIdPresentationState.RequestCreated },
    });
    // Return an object whose constructor is not named DigitalCredential
    const notADigitalCredential = Object.create({ constructor: { name: 'PublicKeyCredential' } });
    mockNavigatorCredentials(notADigitalCredential);

    const { result, error } = await runThunk(baseParams, api);
    expect(result).toBeUndefined();
    expect(error).toBeDefined();
  });

  it('uses demoUser DID when useDemo is true', async () => {
    const authorizationRequestObject = { response_mode: 'dc_api', nonce: 'abc' };
    const credential = new DigitalCredential({ vp_token: 'tok' });

    const api = makeApi({
      authorizationRequest: 'openid4vp://...',
      authorizationRequestObject,
      verificationSession: { id: 'sess-7', state: OpenIdPresentationState.RequestCreated },
    });
    mockNavigatorCredentials(credential);

    await runThunk({ ...baseParams, useDemo: true }, api);

    const [firstCall] = (api.post as jest.Mock).mock.calls;
    expect(firstCall[1].publicVerifierId).toBe(demoUser.did);
  });
});
