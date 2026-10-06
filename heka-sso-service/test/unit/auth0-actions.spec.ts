import { describe, expect, test, vi } from 'vitest'

import { onExecuteCredentialsExchange } from '../../auth0/actions/credentials-exchange'
import { onExecutePostLogin } from '../../auth0/actions/post-login'

const HEKA_AUDIENCE = 'https://heka-identity'

const makeLoginApi = () => ({
  accessToken: { setCustomClaim: vi.fn() },
  idToken: { setCustomClaim: vi.fn() },
  user: { setAppMetadata: vi.fn() },
})

const claimsOf = (setCustomClaim: ReturnType<typeof vi.fn>) =>
  Object.fromEntries(setCustomClaim.mock.calls.map(([name, value]) => [name, value]))

describe('Auth0 post-login Action', () => {
  const baseEvent = {
    resource_server: { identifier: HEKA_AUDIENCE },
    user: { user_id: 'auth0|65f1c2d3e4a5b6c7d8e9f0a1', username: 'alice', nickname: 'ali', name: 'Alice Example' },
  }

  test('adds the claim contract to access and id tokens', async () => {
    const api = makeLoginApi()

    await onExecutePostLogin(
      {
        ...baseEvent,
        user: { ...baseEvent.user, app_metadata: { heka_uid: 'f47ac10b-legacy', org_id: 'org-1' } },
        authorization: { roles: ['Issuer', 'some-auth0-role'] },
      },
      api
    )

    const expected = {
      'https://heka/roles': ['Issuer'],
      'https://heka/name': 'alice',
      'https://heka/heka_uid': 'f47ac10b-legacy',
      'https://heka/org_id': 'org-1',
    }
    expect(claimsOf(api.accessToken.setCustomClaim)).toEqual(expected)
    expect(claimsOf(api.idToken.setCustomClaim)).toEqual(expected)
    expect(api.user.setAppMetadata).not.toHaveBeenCalled()
  })

  test('does nothing for logins that did not request the Heka API', async () => {
    const api = makeLoginApi()

    await onExecutePostLogin({ ...baseEvent, resource_server: { identifier: 'https://other-api' } }, api)
    await onExecutePostLogin({ ...baseEvent, resource_server: undefined }, api)

    expect(api.accessToken.setCustomClaim).not.toHaveBeenCalled()
    expect(api.idToken.setCustomClaim).not.toHaveBeenCalled()
    expect(api.user.setAppMetadata).not.toHaveBeenCalled()
  })

  test('assigns and persists the default role for a user without one', async () => {
    const api = makeLoginApi()

    await onExecutePostLogin(baseEvent, api)

    expect(api.user.setAppMetadata).toHaveBeenCalledWith('heka_role', 'Admin')
    expect(claimsOf(api.accessToken.setCustomClaim)).toEqual({
      'https://heka/roles': ['Admin'],
      'https://heka/name': 'alice',
      'https://heka/heka_uid': 'auth0|65f1c2d3e4a5b6c7d8e9f0a1',
    })
  })

  test('prefers app_metadata.heka_role over the default and over ambiguous Auth0 roles', async () => {
    const api = makeLoginApi()

    await onExecutePostLogin(
      {
        ...baseEvent,
        user: { ...baseEvent.user, app_metadata: { heka_role: 'User' } },
        authorization: { roles: ['Admin', 'Issuer'] },
      },
      api
    )

    expect(claimsOf(api.accessToken.setCustomClaim)['https://heka/roles']).toEqual(['User'])
    expect(api.user.setAppMetadata).not.toHaveBeenCalled()
  })

  test('honours the secrets for audience, namespace and default role', async () => {
    const api = makeLoginApi()

    await onExecutePostLogin(
      {
        ...baseEvent,
        resource_server: { identifier: 'https://api.example' },
        secrets: {
          HEKA_AUDIENCE: 'https://api.example',
          HEKA_CLAIM_NAMESPACE: 'https://claims.example/',
          HEKA_DEFAULT_ROLE: 'User',
        },
      },
      api
    )

    expect(claimsOf(api.accessToken.setCustomClaim)).toEqual({
      'https://claims.example/roles': ['User'],
      'https://claims.example/name': 'alice',
      'https://claims.example/heka_uid': 'auth0|65f1c2d3e4a5b6c7d8e9f0a1',
    })
    expect(api.user.setAppMetadata).toHaveBeenCalledWith('heka_role', 'User')
  })

  test('falls back through nickname, name, email and user_id for the display name', async () => {
    const claimFor = async (user: Record<string, unknown>) => {
      const api = makeLoginApi()
      await onExecutePostLogin({ ...baseEvent, user: { user_id: 'auth0|x', ...user } }, api)
      return claimsOf(api.accessToken.setCustomClaim)['https://heka/name']
    }

    expect(await claimFor({ nickname: 'ali', name: 'Alice', email: 'a@x' })).toBe('ali')
    expect(await claimFor({ name: 'Alice', email: 'a@x' })).toBe('Alice')
    expect(await claimFor({ email: 'a@x' })).toBe('a@x')
    expect(await claimFor({})).toBe('auth0|x')
  })
})

describe('Auth0 credentials-exchange Action', () => {
  const makeApi = () => ({
    accessToken: { setCustomClaim: vi.fn() },
    access: { deny: vi.fn() },
  })
  const client = { client_id: 'abc123', name: 'heka-sso-service', metadata: { heka_role: 'Admin' } }

  test('adds the claim contract from the application metadata', async () => {
    const api = makeApi()

    await onExecuteCredentialsExchange({ resource_server: { identifier: HEKA_AUDIENCE }, client }, api)

    expect(claimsOf(api.accessToken.setCustomClaim)).toEqual({
      'https://heka/roles': ['Admin'],
      'https://heka/name': 'heka-sso-service',
      'https://heka/heka_uid': 'abc123@clients',
    })
    expect(api.access.deny).not.toHaveBeenCalled()
  })

  test('uses explicit metadata for name, uid and org_id', async () => {
    const api = makeApi()

    await onExecuteCredentialsExchange(
      {
        resource_server: { identifier: HEKA_AUDIENCE },
        client: {
          ...client,
          metadata: { heka_role: 'Verifier', org_id: 'org-9', heka_uid: 'verifier-bot', heka_name: 'Verifier bot' },
        },
      },
      api
    )

    expect(claimsOf(api.accessToken.setCustomClaim)).toEqual({
      'https://heka/roles': ['Verifier'],
      'https://heka/name': 'Verifier bot',
      'https://heka/heka_uid': 'verifier-bot',
      'https://heka/org_id': 'org-9',
    })
  })

  test('denies the exchange when the application has no valid heka_role', async () => {
    const api = makeApi()

    await onExecuteCredentialsExchange(
      { resource_server: { identifier: HEKA_AUDIENCE }, client: { ...client, metadata: { heka_role: 'Root' } } },
      api
    )
    await onExecuteCredentialsExchange({ resource_server: { identifier: HEKA_AUDIENCE }, client: { ...client, metadata: {} } }, api)

    expect(api.access.deny).toHaveBeenCalledTimes(2)
    expect(api.access.deny.mock.calls[0][0]).toBe('invalid_client_metadata')
    expect(api.accessToken.setCustomClaim).not.toHaveBeenCalled()
  })

  test('does nothing for exchanges that did not request the Heka API', async () => {
    const api = makeApi()

    await onExecuteCredentialsExchange({ resource_server: { identifier: 'https://other-api' }, client }, api)

    expect(api.accessToken.setCustomClaim).not.toHaveBeenCalled()
    expect(api.access.deny).not.toHaveBeenCalled()
  })
})
