import { OidcSigningKey } from '../../src/core/database'
import { SigningKeysService } from '../../src/oidc'

/**
 * In-memory stand-in for the (Postgres) EntityManager. `transactional`
 * runs the callback against the same fake; `execute` emulates the two raw
 * statements the service issues — the advisory lock (a no-op here; real
 * cross-connection serialization is covered by the e2e concurrency suite)
 * and `retireKey`'s conditional update with the last-active-key guard.
 */
class FakeEntityManager {
  public store: OidcSigningKey[] = []
  public lockAcquisitions = 0

  public fork() {
    return this
  }

  public async transactional<T>(fn: (em: this) => Promise<T>): Promise<T> {
    return fn(this)
  }

  public async execute(sql: string, params: unknown[] = []) {
    if (sql.includes('pg_advisory_xact_lock')) {
      this.lockAcquisitions++
      return []
    }
    if (sql.includes('update oidc_signing_key')) {
      const kid = params[0] as string
      const target = this.store.find((key) => key.kid === kid && (key.retiredAt ?? null) === null)
      const hasOtherActive =
        target && this.store.some((key) => key.alg === target.alg && (key.retiredAt ?? null) === null && key.kid !== kid)
      if (!target || !hasOtherActive) return { affectedRows: 0 }
      target.retiredAt = new Date()
      return { affectedRows: 1 }
    }
    throw new Error(`FakeEntityManager: unexpected SQL '${sql}'`)
  }

  public async count(_entity: unknown, where: { kid?: string; alg?: string; retiredAt?: null }) {
    return this.matching(where).length
  }

  public async find(_entity: unknown, where: { retiredAt?: null }, _options?: unknown) {
    return this.matching(where).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  }

  private pending: OidcSigningKey[] = []

  public persist(entity: OidcSigningKey) {
    this.pending.push(entity)
    return this
  }

  public async flush() {
    this.store.push(...this.pending)
    this.pending = []
  }

  private matching(where: { kid?: string; alg?: string; retiredAt?: null }) {
    return this.store.filter(
      (key) =>
        (where.kid === undefined || key.kid === where.kid) &&
        (where.alg === undefined || key.alg === where.alg) &&
        (!('retiredAt' in where) || (key.retiredAt ?? null) === where.retiredAt)
    )
  }
}

const serviceWith = (em: FakeEntityManager, jwks?: { keys: Record<string, any>[] }) =>
  new SigningKeysService(em as any, { oidcConfig: { jwks } } as any)

describe('SigningKeysService', () => {
  test('generates and persists RS256 + ES256 keys on first start', async () => {
    const em = new FakeEntityManager()
    const service = serviceWith(em)

    const jwks = await service.getJwks()

    expect(em.store).toHaveLength(2)
    expect(jwks.keys.map((key) => key.alg).sort()).toEqual(['ES256', 'RS256'])

    const rsa = jwks.keys.find((key) => key.alg === 'RS256')!
    expect(rsa.kty).toBe('RSA')
    expect(rsa.d).toBeDefined()
    expect(Buffer.from(rsa.n, 'base64url')).toHaveLength(256)

    const ec = jwks.keys.find((key) => key.alg === 'ES256')!
    expect(ec.kty).toBe('EC')
    expect(ec.crv).toBe('P-256')
    expect(ec.d).toBeDefined()

    // kid is the RFC 7638 thumbprint: 43-char base64url SHA-256
    for (const key of jwks.keys) {
      expect(key.use).toBe('sig')
      expect(key.kid).toMatch(/^[\w-]{43}$/)
    }
  })

  test('does not regenerate existing keys', async () => {
    const em = new FakeEntityManager()
    const service = serviceWith(em)

    await service.getJwks()
    await service.getJwks()

    expect(em.store).toHaveLength(2)
  })

  test('returns the configuration override without touching the database', async () => {
    const em = new FakeEntityManager()
    const override = { keys: [{ kty: 'RSA', kid: 'override-key' }] }
    const service = serviceWith(em, override)

    expect(await service.getJwks()).toBe(override)
    expect(em.store).toHaveLength(0)
    expect(em.lockAcquisitions).toBe(0)
  })

  test('every database path runs under the signing-keys advisory lock', async () => {
    const em = new FakeEntityManager()
    const service = serviceWith(em)

    await service.getJwks()
    await service.rotateKey('RS256')
    await service.retireKey('unknown-kid')

    expect(em.lockAcquisitions).toBe(3)
  })

  test('rotation publishes the new key first and retirement unpublishes the old one', async () => {
    const em = new FakeEntityManager()
    const service = serviceWith(em)

    await service.getJwks()
    const oldKid = em.store.find((key) => key.alg === 'RS256')!.kid
    em.store.forEach((key, index) => (key.createdAt = new Date(1000 + index)))

    const newKid = await service.rotateKey('RS256')
    em.store.find((key) => key.kid === newKid)!.createdAt = new Date(5000)

    // Overlap phase: both keys published, the newest first (it becomes the signing key)
    let jwks = await service.getJwks()
    expect(jwks.keys).toHaveLength(3)
    expect(jwks.keys[0].kid).toBe(newKid)

    await service.retireKey(oldKid)

    jwks = await service.getJwks()
    expect(jwks.keys).toHaveLength(2)
    expect(jwks.keys.map((key) => key.kid)).not.toContain(oldKid)
    expect(em.store).toHaveLength(3)
  })

  test('refuses to retire the last active key of an algorithm', async () => {
    const em = new FakeEntityManager()
    const service = serviceWith(em)

    await service.getJwks() // one active key per alg
    const rsaKid = em.store.find((key) => key.alg === 'RS256')!.kid

    await expect(service.retireKey(rsaKid)).rejects.toThrow(/last active key/)
    expect(em.store.filter((key) => key.alg === 'RS256' && !key.retiredAt)).toHaveLength(1)
  })

  test('still retires a key when another active key of the same alg exists', async () => {
    const em = new FakeEntityManager()
    const service = serviceWith(em)

    await service.getJwks()
    const oldKid = em.store.find((key) => key.alg === 'ES256')!.kid
    await service.rotateKey('ES256')

    await service.retireKey(oldKid)

    const active = em.store.filter((key) => key.alg === 'ES256' && !key.retiredAt)
    expect(active).toHaveLength(1)
    expect(active[0].kid).not.toBe(oldKid)
  })

  test('retireKey stays idempotent for an already-retired or unknown kid', async () => {
    const em = new FakeEntityManager()
    const service = serviceWith(em)

    await service.getJwks()
    const oldKid = em.store.find((key) => key.alg === 'RS256')!.kid
    await service.rotateKey('RS256')
    await service.retireKey(oldKid)

    await expect(service.retireKey(oldKid)).resolves.toBeUndefined()
    await expect(service.retireKey('no-such-kid')).resolves.toBeUndefined()
    expect(em.store.filter((key) => key.alg === 'RS256' && !key.retiredAt)).toHaveLength(1)
  })
})
