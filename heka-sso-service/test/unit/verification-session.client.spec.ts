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

/** Client on the P1.6.7 service-account path (no static token override). */
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

/**
 * Verification-session client (P1.6 / P1.6.1): sessions are always created as
 * signed authorization requests (JAR) — no unsigned fallback.
 */
describe('VerificationSessionClient', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('creates the session with a requestSigner — JAR, always (P1.6.1)', async () => {
    fetchMock.mockResolvedValue(
      fetchResponse({
        verificationSession: { id: 'session-1' },
        authorizationRequest: 'openid4vp://?request_uri=https%3A%2F%2Fis%2Foid4vp%2Fabc',
      }),
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
    await expect(
      buildClient({ IDENTITY_SERVICE_REQUEST_SIGNER_DID: '' }).createSignedRequest(loginConfig),
    ).rejects.toThrow(/no unsigned fallback/)
    await expect(
      buildClient({ IDENTITY_SERVICE_PUBLIC_VERIFIER_ID: '' }).createSignedRequest(loginConfig),
    ).rejects.toThrow(/no unsigned fallback/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('rejects a login configuration without a DCQL query', async () => {
    const withoutQuery = new OidcLoginConfig({ id: 'no-query', verificationTemplate: 'default' })

    await expect(buildClient().createSignedRequest(withoutQuery)).rejects.toThrow(/no DCQL query/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('getSession returns the record state', async () => {
    fetchMock.mockResolvedValue(
      fetchResponse({
        id: 'session-1',
        state: VerificationSessionState.ResponseVerified,
        sharedAttributes: { 'pid.given_name': 'Ada' },
      }),
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

  test('service account (P1.6.7): acquires a token via auth-service login and retries once on 401', async () => {
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
