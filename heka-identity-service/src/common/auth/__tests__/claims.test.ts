import { UnauthorizedException } from '@nestjs/common'

import { Role } from 'common/auth'
import { OidcClaimsConfig, oidcClaimsDefaults } from 'config/oidc'

import { getClaim, mapClaims } from '../claims'

describe('getClaim', () => {
  const payload = {
    sub: 'user-1',
    'https://heka.example/roles': ['Admin'],
    'dotted.key': 'literal',
    realm_access: { roles: ['default-roles-heka'] },
    nested: { 'a/b': 1, 'c~d': 2 },
  }

  test('resolves a top-level key', () => {
    expect(getClaim(payload, 'sub')).toBe('user-1')
  })

  test('resolves a URL-style claim name as a literal key', () => {
    expect(getClaim(payload, 'https://heka.example/roles')).toEqual(['Admin'])
  })

  test('prefers a literal key over dotted resolution', () => {
    expect(getClaim(payload, 'dotted.key')).toBe('literal')
  })

  test('resolves a dotted path', () => {
    expect(getClaim(payload, 'realm_access.roles')).toEqual(['default-roles-heka'])
  })

  test('resolves a JSON pointer', () => {
    expect(getClaim(payload, '/realm_access/roles')).toEqual(['default-roles-heka'])
  })

  test('unescapes JSON pointer segments', () => {
    expect(getClaim(payload, '/nested/a~1b')).toBe(1)
    expect(getClaim(payload, '/nested/c~0d')).toBe(2)
    expect(getClaim(payload, '/https:~1~1heka.example~1roles')).toEqual(['Admin'])
  })

  test('returns undefined for missing paths and when traversing a non-object', () => {
    expect(getClaim(payload, 'missing')).toBeUndefined()
    expect(getClaim(payload, 'realm_access.missing.deeper')).toBeUndefined()
    expect(getClaim(payload, 'sub.x')).toBeUndefined()
  })
})

describe('mapClaims', () => {
  const defaults: OidcClaimsConfig = { ...oidcClaimsDefaults, name: [...oidcClaimsDefaults.name] }

  describe('Keycloak-shaped tokens', () => {
    const keycloakPayload = {
      iss: 'http://localhost:8080/realms/heka-platform',
      aud: ['heka-identity-service', 'account'],
      sub: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      typ: 'Bearer',
      azp: 'heka-identity-web-ui',
      realm_access: { roles: ['default-roles-heka', 'offline_access', 'uma_authorization', 'Issuer'] },
      resource_access: { 'heka-identity-service': { roles: ['Issuer'] } },
      roles: ['Issuer'],
      preferred_username: 'alice',
      name: 'Alice Example',
      org_id: 'org-1',
    }

    test('maps the default claim names', () => {
      expect(mapClaims(keycloakPayload, defaults)).toEqual({
        sub: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        roles: [Role.Issuer],
        name: 'Alice Example',
        org_id: 'org-1',
      })
    })

    test('filters provider noise out of realm roles', () => {
      const result = mapClaims(keycloakPayload, { ...defaults, roles: 'realm_access.roles' })
      expect(result.roles).toEqual([Role.Issuer])
    })

    test('reads client roles through a nested path', () => {
      const result = mapClaims(keycloakPayload, { ...defaults, roles: '/resource_access/heka-identity-service/roles' })
      expect(result.roles).toEqual([Role.Issuer])
    })

    test('falls back to preferred_username when name is absent', () => {
      const withoutName = Object.fromEntries(Object.entries(keycloakPayload).filter(([key]) => key !== 'name'))
      expect(mapClaims(withoutName, defaults).name).toBe('alice')
    })

    test('reads the user id from a custom claim', () => {
      const result = mapClaims({ ...keycloakPayload, heka_uid: 'legacy-uuid' }, { ...defaults, userId: 'heka_uid' })
      expect(result.sub).toBe('legacy-uuid')
    })
  })

  describe('Auth0-shaped tokens', () => {
    const auth0Payload = {
      iss: 'https://heka.eu.auth0.com/',
      aud: ['https://heka-identity', 'https://heka.eu.auth0.com/userinfo'],
      sub: 'auth0|65f1c2d3e4a5b6c7d8e9f0a1',
      azp: 'SPAclientId',
      scope: 'openid profile offline_access',
      permissions: ['read:credentials'],
      'https://heka/roles': ['Verifier'],
      'https://heka/name': 'bob',
      'https://heka/org_id': 'org-2',
      'https://heka/heka_uid': 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    }

    const auth0Config: OidcClaimsConfig = {
      userId: 'https://heka/heka_uid',
      roles: 'https://heka/roles',
      name: ['https://heka/name', 'name', 'nickname'],
      orgId: 'https://heka/org_id',
    }

    test('maps namespaced claims given as literal keys', () => {
      expect(mapClaims(auth0Payload, auth0Config)).toEqual({
        sub: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        roles: [Role.Verifier],
        name: 'bob',
        org_id: 'org-2',
      })
    })

    test('maps namespaced claims given as JSON pointers', () => {
      const pointerConfig: OidcClaimsConfig = {
        userId: '/https:~1~1heka~1heka_uid',
        roles: '/https:~1~1heka~1roles',
        name: ['/https:~1~1heka~1name'],
        orgId: '/https:~1~1heka~1org_id',
      }
      expect(mapClaims(auth0Payload, pointerConfig)).toEqual(mapClaims(auth0Payload, auth0Config))
    })

    test('uses the provider subject when the user id claim is sub', () => {
      const result = mapClaims(auth0Payload, { ...auth0Config, userId: 'sub' })
      expect(result.sub).toBe('auth0|65f1c2d3e4a5b6c7d8e9f0a1')
    })
  })

  describe('contract rules', () => {
    const base = { sub: 'user-1', roles: ['User'], name: 'John' }

    test('accepts the role given as a single string', () => {
      expect(mapClaims({ ...base, roles: 'Admin' }, defaults).roles).toEqual([Role.Admin])
    })

    test('omits org_id when absent or empty', () => {
      expect(mapClaims(base, defaults)).not.toHaveProperty('org_id')
      expect(mapClaims({ ...base, org_id: '' }, defaults)).not.toHaveProperty('org_id')
      expect(mapClaims({ ...base, org_id: null }, defaults)).not.toHaveProperty('org_id')
    })

    test('falls back to the user id when no name claim is usable', () => {
      expect(mapClaims({ sub: 'user-1', roles: ['User'], name: '  ' }, defaults).name).toBe('user-1')
    })

    test.each([
      ['missing user id', { roles: ['User'] }],
      ['non-string user id', { sub: 42, roles: ['User'] }],
      ['empty user id', { sub: '', roles: ['User'] }],
      ['user id longer than 255 characters', { sub: 'x'.repeat(256), roles: ['User'] }],
      ['missing roles', { sub: 'user-1' }],
      ['empty roles', { sub: 'user-1', roles: [] }],
      ['only unknown roles', { sub: 'user-1', roles: ['Hacker', 'offline_access'] }],
      ['two known roles', { sub: 'user-1', roles: ['Admin', 'User'] }],
      ['non-string org_id', { sub: 'user-1', roles: ['User'], org_id: 7 }],
    ])('rejects %s', (_label, payload) => {
      expect(() => mapClaims(payload as Record<string, unknown>, defaults)).toThrow(UnauthorizedException)
    })
  })
})
