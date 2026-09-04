import { ConfigService, OidcConfig, OidcLoginConfig } from '../../src/core/config'
import { IdentityServiceTokenProvider, VerificationSessionClient, VerificationSessionState } from '../../src/oidc'

const dcqlQuery = {
  credentials: [{ id: 'pid', format: 'dc+sd-jwt', claims: [{ path: ['given_name'] }] }],
}

const loginConfig = new OidcLoginConfig({
  id: 'default',
  verificationTemplate: 'default',
  dcqlQuery,
  claimMapping: { 'pid.given_name': 'given_name' },
})

const buildClient = (env: Record<string, string> = {}) => {
  const config = new OidcConfig({
    IDENTITY_SERVICE_BASE_URL: 'http://identity.internal:3000',
    IDENTITY_SERVICE_AUTH_TOKEN: 'identity-token',
    IDENTITY_SERVICE_PUBLIC_VERIFIER_ID: 'verifier-1',
    IDENTITY_SERVICE_REQUEST_SIGNER_DID: 'did:web:sso.example.com',
    ...env,
  })
  const configService = { oidcConfig: config } as unknown as ConfigService
  return new VerificationSessionClient(configService, new IdentityServiceTokenProvider(configService))
}

/** Client on the service-account path (no static token override). */
const buildServiceAccountClient = () =>
  buildClient({
    IDENTITY_SERVICE_AUTH_TOKEN: '',
    AUTH_SERVICE_BASE_URL: 'http://auth.internal:3004',
    IDENTITY_SERVICE_AUTH_NAME: 'sso-bridge',
    IDENTITY_SERVICE_AUTH_PASSWORD: 'service-account-password',
  })

const fetchResponse = (body: unknown, status = 200) => ({
  ok: status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
})

describe('VerificationSessionClient', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('creates the session with a requestSigner — JAR, always', async () => {
    fetchMock.mockResolvedValue(
      fetchResponse({
        verificationSession: { id: 'session-1' },
        authorizationRequest: 'openid4vp://?request_uri=https%3A%2F%2Fis%2Foid4vp%2Fabc',
      })
    )

    const created = await buildClient().createSignedRequest(loginConfig)

    expect(created).toEqual({
      sessionId: 'session-1',
      authorizationRequest: 'openid4vp://?request_uri=https%3A%2F%2Fis%2Foid4vp%2Fabc',
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://identity.internal:3000/openid4vc/verification-session/request')
    expect(init.method).toBe('POST')
    expect(init.headers.authorization).toBe('Bearer identity-token')
    expect(JSON.parse(init.body)).toEqual({
      publicVerifierId: 'verifier-1',
      requestSigner: { method: 'did', did: 'did:web:sso.example.com' },
      dcql: { query: dcqlQuery },
      responseMode: 'direct_post',
      version: 'v1',
    })
  })

  test('fails fast when the signer DID or verifier id is not configured — never falls back to unsigned', async () => {
    await expect(buildClient({ IDENTITY_SERVICE_REQUEST_SIGNER_DID: '' }).createSignedRequest(loginConfig)).rejects.toThrow(
      /no unsigned fallback/
    )
    await expect(buildClient({ IDENTITY_SERVICE_PUBLIC_VERIFIER_ID: '' }).createSignedRequest(loginConfig)).rejects.toThrow(
      /no unsigned fallback/
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('rejects a login configuration without a DCQL query', async () => {
    const withoutQuery = new OidcLoginConfig({ id: 'no-query', verificationTemplate: 'default' })

    await expect(buildClient().createSignedRequest(withoutQuery)).rejects.toThrow(/no DCQL query/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('DC API: creates a signed dc_api session bound to the calling origin', async () => {
    fetchMock.mockResolvedValue(
      fetchResponse({
        verificationSession: { id: 'dc-session-1' },
        authorizationRequest: 'openid4vp://…',
        authorizationRequestObject: { request: 'signed-jar-jwt' },
      })
    )

    const created = await buildClient().createDcApiRequest(loginConfig, 'https://sso.example.com')

    expect(created).toEqual({
      sessionId: 'dc-session-1',
      protocol: 'openid4vp-v1-signed',
      authorizationRequestObject: { request: 'signed-jar-jwt' },
    })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://identity.internal:3000/openid4vc/verification-session/request')
    expect(JSON.parse(init.body)).toEqual({
      publicVerifierId: 'verifier-1',
      requestSigner: { method: 'did', did: 'did:web:sso.example.com' },
      dcql: { query: dcqlQuery },
      responseMode: 'dc_api',
      version: 'v1',
      expectedOrigins: ['https://sso.example.com'],
    })
  })

  test('DC API: an unsigned request object maps to the unsigned protocol id', async () => {
    fetchMock.mockResolvedValue(
      fetchResponse({
        verificationSession: { id: 'dc-session-2' },
        authorizationRequest: 'openid4vp://…',
        authorizationRequestObject: { response_type: 'vp_token', dcql_query: dcqlQuery },
      })
    )

    const created = await buildClient().createDcApiRequest(loginConfig, 'https://sso.example.com')
    expect(created.protocol).toBe('openid4vp-v1-unsigned')
  })

  test('DC API: fails when the identity service returns no authorizationRequestObject', async () => {
    fetchMock.mockResolvedValue(fetchResponse({ verificationSession: { id: 'dc-session-3' }, authorizationRequest: 'openid4vp://…' }))

    await expect(buildClient().createDcApiRequest(loginConfig, 'https://sso.example.com')).rejects.toThrow(/no authorizationRequestObject/)
  })

  test('DC API: fails fast when verifier id or signer DID is not configured', async () => {
    await expect(
      buildClient({ IDENTITY_SERVICE_REQUEST_SIGNER_DID: '' }).createDcApiRequest(loginConfig, 'https://sso.example.com')
    ).rejects.toThrow(/must be configured/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('DC API: verifyDcApiResponse posts the browser-forwarded response to the origin-bound verify endpoint', async () => {
    fetchMock.mockResolvedValue(
      fetchResponse({
        id: 'dc-session-1',
        state: VerificationSessionState.ResponseVerified,
        sharedAttributes: { given_name: 'Ada' },
      })
    )

    const record = await buildClient().verifyDcApiResponse('dc-session-1', { vp_token: { pid: ['token'] } }, 'https://sso.example.com')

    expect(record.state).toBe(VerificationSessionState.ResponseVerified)
    expect(record.sharedAttributes).toEqual({ given_name: 'Ada' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://identity.internal:3000/openid4vc/verification-session/dc-session-1/verify')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({
      authorizationResponse: { vp_token: { pid: ['token'] } },
      origin: 'https://sso.example.com',
    })
  })

  test('getSession returns the record state', async () => {
    fetchMock.mockResolvedValue(
      fetchResponse({
        id: 'session-1',
        state: VerificationSessionState.ResponseVerified,
        sharedAttributes: { 'pid.given_name': 'Ada' },
      })
    )

    const record = await buildClient().getSession('session-1')

    expect(fetchMock.mock.calls[0][0]).toBe('http://identity.internal:3000/openid4vc/verification-session/session-1')
    expect(record.state).toBe(VerificationSessionState.ResponseVerified)
    expect(record.sharedAttributes).toEqual({ 'pid.given_name': 'Ada' })
  })

  test('surfaces identity-service errors with status and detail', async () => {
    fetchMock.mockResolvedValue(fetchResponse({ message: 'requestSigner.did is required' }, 422))

    await expect(buildClient().createSignedRequest(loginConfig)).rejects.toThrow(/422.*requestSigner\.did/)
  })

  test('service account: acquires a token via auth-service login and retries once on 401', async () => {
    fetchMock
      // lazy login, then the session call fails with an unexpected 401
      .mockResolvedValueOnce(fetchResponse({ access: 'stale-token', expires_in: 3600 }))
      .mockResolvedValueOnce(fetchResponse({ error: 'Unauthorized' }, 401))
      // retry: fresh login, then the call succeeds
      .mockResolvedValueOnce(fetchResponse({ access: 'fresh-token', expires_in: 3600 }))
      .mockResolvedValueOnce(fetchResponse({ id: 'session-1', state: VerificationSessionState.RequestCreated }))

    const record = await buildServiceAccountClient().getSession('session-1')

    expect(record.state).toBe(VerificationSessionState.RequestCreated)
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(fetchMock.mock.calls[0][0]).toBe('http://auth.internal:3004/api/v1/oauth/token')
    expect(fetchMock.mock.calls[1][1].headers.authorization).toBe('Bearer stale-token')
    expect(fetchMock.mock.calls[2][0]).toBe('http://auth.internal:3004/api/v1/oauth/token')
    expect(fetchMock.mock.calls[3][1].headers.authorization).toBe('Bearer fresh-token')
  })

  test('service account: a second 401 surfaces as a failure — no retry loop', async () => {
    fetchMock
      .mockResolvedValueOnce(fetchResponse({ access: 'token-1', expires_in: 3600 }))
      .mockResolvedValueOnce(fetchResponse({ error: 'Unauthorized' }, 401))
      .mockResolvedValueOnce(fetchResponse({ access: 'token-2', expires_in: 3600 }))
      .mockResolvedValueOnce(fetchResponse({ error: 'Unauthorized' }, 401))

    await expect(buildServiceAccountClient().getSession('session-1')).rejects.toThrow(/failed: 401/)
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  test('static token override: a 401 is not retried', async () => {
    fetchMock.mockResolvedValue(fetchResponse({ error: 'Unauthorized' }, 401))

    await expect(buildClient().getSession('session-1')).rejects.toThrow(/failed: 401/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
