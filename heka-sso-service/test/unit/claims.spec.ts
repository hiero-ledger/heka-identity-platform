import { OidcLoginConfig, SubStrategy } from '../../src/core/config'
import { computeSub, mapClaims } from '../../src/oidc'

/**
 * Claims pipeline (INTEGRATION.md P1.3): claim mapping per the login
 * configuration (§4.2) and the `derived` pairwise `sub` strategy (§4.3).
 */
describe('claims pipeline', () => {
  const loginConfig = new OidcLoginConfig({
    id: 'default',
    verificationTemplate: 'default',
    claimMapping: {
      'pid.given_name': 'given_name',
      'pid.family_name': 'family_name',
      'pid.email': 'email',
    },
    staticClaims: { department: 'QA', given_name: 'Should-Be-Overridden' },
    subStrategy: 'derived',
  })

  const salt = 'unit-test-sub-hmac-salt-0123456789abcdef'

  describe('mapClaims', () => {
    test('maps attribute paths onto OIDC claim names', () => {
      const claims = mapClaims(loginConfig, {
        'pid.given_name': 'Ada',
        'pid.family_name': 'Lovelace',
        'pid.email': 'ada@example.com',
      })

      expect(claims).toMatchObject({ given_name: 'Ada', family_name: 'Lovelace', email: 'ada@example.com' })
    })

    test('static claims fill in underneath — mapped attributes win', () => {
      const claims = mapClaims(loginConfig, { 'pid.given_name': 'Ada' })

      expect(claims.department).toBe('QA')
      expect(claims.given_name).toBe('Ada')
    })

    test('carries the login-config id in a custom claim', () => {
      expect(mapClaims(loginConfig, {}).login_config_id).toBe('default')
    })

    test('skips unmapped and undisclosed attributes', () => {
      const claims = mapClaims(loginConfig, { 'pid.given_name': 'Ada', 'pid.nationality': 'GB' })

      expect(claims.family_name).toBeUndefined()
      expect(Object.values(claims)).not.toContain('GB')
    })
  })

  describe('computeSub (derived)', () => {
    const claims = { given_name: 'Ada', family_name: 'Lovelace' }

    test('is stable for the same client and claim set', () => {
      expect(computeSub(loginConfig, 'client-a', claims, salt)).toBe(computeSub(loginConfig, 'client-a', claims, salt))
    })

    test('is independent of claim key order, including nested objects', () => {
      const reordered = { family_name: 'Lovelace', given_name: 'Ada' }
      expect(computeSub(loginConfig, 'client-a', claims, salt)).toBe(
        computeSub(loginConfig, 'client-a', reordered, salt),
      )

      const nested = { address: { country: 'GB', city: 'London' } }
      const nestedReordered = { address: { city: 'London', country: 'GB' } }
      expect(computeSub(loginConfig, 'client-a', nested, salt)).toBe(
        computeSub(loginConfig, 'client-a', nestedReordered, salt),
      )
    })

    test('is pairwise: differs per client for the same claim set', () => {
      expect(computeSub(loginConfig, 'client-a', claims, salt)).not.toBe(
        computeSub(loginConfig, 'client-b', claims, salt),
      )
    })

    test('differs per claim set and per salt', () => {
      expect(computeSub(loginConfig, 'client-a', claims, salt)).not.toBe(
        computeSub(loginConfig, 'client-a', { ...claims, given_name: 'Grace' }, salt),
      )
      expect(computeSub(loginConfig, 'client-a', claims, salt)).not.toBe(
        computeSub(loginConfig, 'client-a', claims, `${salt}-other`),
      )
    })

    test('yields a url-safe value', () => {
      expect(computeSub(loginConfig, 'client-a', claims, salt)).toMatch(/^[A-Za-z0-9_-]{43}$/)
    })
  })

  test('non-derived strategies are not implemented until Phase 3 (P3.8, postponed from P2.6)', () => {
    for (const subStrategy of [SubStrategy.credentialClaim, SubStrategy.ephemeral]) {
      const config = new OidcLoginConfig({ ...loginConfig, subStrategy })
      expect(() => computeSub(config, 'client-a', {}, salt)).toThrow(/not implemented until Phase 3/)
    }
  })
})
