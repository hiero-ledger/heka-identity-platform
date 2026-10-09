import { describe, expect, test, vi } from 'vitest'

import { onExecuteCredentialsExchange } from '../../auth0/actions/credentials-exchange'
import { onExecutePostLogin } from '../../auth0/actions/post-login'

const HEKA_AUDIENCE = 'https://heka-identity'

const makeLoginApi = () => ({
  accessToken: { setCustomClaim: vi.fn() },
  idToken: { setCustomClaim: vi.fn() },
  user: { setAppMetadata: vi.fn() },
  access: { deny: vi.fn() },
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

  test('assigns and persists User, never Admin, as the default role for a user without one', async () => {
    const api = makeLoginApi()

    await onExecutePostLogin(baseEvent, api)

    expect(api.user.setAppMetadata).toHaveBeenCalledWith('heka_role', 'User')
    expect(claimsOf(api.accessToken.setCustomClaim)).toEqual({
      'https://heka/roles': ['User'],
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
          HEKA_DEFAULT_ROLE: 'OrgMember',
        },
      },
      api
    )

    expect(claimsOf(api.accessToken.setCustomClaim)).toEqual({
      'https://claims.example/roles': ['OrgMember'],
      'https://claims.example/name': 'alice',
      'https://claims.example/heka_uid': 'auth0|65f1c2d3e4a5b6c7d8e9f0a1',
    })
    expect(api.user.setAppMetadata).toHaveBeenCalledWith('heka_role', 'OrgMember')
  })

  describe('login through an Auth0 Organization', () => {
    const acme = { id: 'org_abc123', name: 'acme', display_name: 'Acme', metadata: { heka_org_id: 'acme-legacy-id' } }

    test('takes the role from the membership and the org id from the organization metadata', async () => {
      const api = makeLoginApi()

      await onExecutePostLogin(
        {
          ...baseEvent,
          // app_metadata from a login without the organization must not leak into this one
          user: { ...baseEvent.user, app_metadata: { heka_uid: 'u-1', heka_role: 'User', org_id: 'other' } },
          organization: acme,
          authorization: { roles: ['Issuer'] },
        },
        api
      )

      expect(claimsOf(api.accessToken.setCustomClaim)).toEqual({
        'https://heka/roles': ['Issuer'],
        'https://heka/name': 'alice',
        'https://heka/heka_uid': 'u-1',
        'https://heka/org_id': 'acme-legacy-id',
      })
      expect(api.user.setAppMetadata).not.toHaveBeenCalled()
      expect(api.access.deny).not.toHaveBeenCalled()
    })

    test('falls back to the Auth0 organization id without heka_org_id metadata', async () => {
      const api = makeLoginApi()

      await onExecutePostLogin({ ...baseEvent, organization: { id: 'org_abc123' }, authorization: { roles: ['OrgAdmin'] } }, api)

      expect(claimsOf(api.accessToken.setCustomClaim)['https://heka/org_id']).toBe('org_abc123')
    })

    test.each([
      ['no role in the organization', []],
      ['two Heka roles', ['Issuer', 'Verifier']],
      ['a role that has no organization (Admin)', ['Admin']],
      ['a role that has no organization (User)', ['User']],
    ])('denies the login with %s', async (_label, roles) => {
      const api = makeLoginApi()

      await onExecutePostLogin({ ...baseEvent, organization: acme, authorization: { roles } }, api)

      expect(api.access.deny).toHaveBeenCalledWith(expect.stringContaining('Your membership of Acme needs exactly one of the roles'))
      expect(api.accessToken.setCustomClaim).not.toHaveBeenCalled()
      expect(api.user.setAppMetadata).not.toHaveBeenCalled()
    })
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
  // The heka-sso-service application as setup-tenant.sh configures it: OrgAdmin of its own organization
  const client = { client_id: 'abc123', name: 'heka-sso-service', metadata: { heka_role: 'OrgAdmin', org_id: 'heka-sso' } }

  test('adds the claim contract from the application metadata, including org_id for an organization role', async () => {
    const api = makeApi()

    await onExecuteCredentialsExchange({ resource_server: { identifier: HEKA_AUDIENCE }, client }, api)

    expect(claimsOf(api.accessToken.setCustomClaim)).toEqual({
      'https://heka/roles': ['OrgAdmin'],
      'https://heka/name': 'heka-sso-service',
      'https://heka/heka_uid': 'abc123@clients',
      'https://heka/org_id': 'heka-sso',
    })
    expect(api.access.deny).not.toHaveBeenCalled()
  })

  test('issues no org_id for User (the heka-demo application)', async () => {
    const api = makeApi()

    await onExecuteCredentialsExchange(
      {
        resource_server: { identifier: HEKA_AUDIENCE },
        client: { client_id: 'demo1', name: 'heka-demo', metadata: { heka_role: 'User', heka_uid: 'e5f6a7b8', heka_name: 'demo' } },
      },
      api
    )

    expect(claimsOf(api.accessToken.setCustomClaim)).toEqual({
      'https://heka/roles': ['User'],
      'https://heka/name': 'demo',
      'https://heka/heka_uid': 'e5f6a7b8',
    })
    expect(api.access.deny).not.toHaveBeenCalled()
  })

  test('denies an organization role without org_id, and org_id on Admin or User', async () => {
    const exchange = async (metadata: Record<string, string>) => {
      const api = makeApi()
      await onExecuteCredentialsExchange({ resource_server: { identifier: HEKA_AUDIENCE }, client: { ...client, metadata } }, api)
      return api
    }

    for (const metadata of [{ heka_role: 'OrgAdmin' }, { heka_role: 'Admin', org_id: 'org-1' }, { heka_role: 'User', org_id: 'org-1' }]) {
      const api = await exchange(metadata)
      expect(api.access.deny).toHaveBeenCalledWith('invalid_client_metadata', expect.stringContaining('org_id'))
      expect(api.accessToken.setCustomClaim).not.toHaveBeenCalled()
    }
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
