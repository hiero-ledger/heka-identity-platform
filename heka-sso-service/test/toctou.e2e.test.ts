import { MikroORM } from '@mikro-orm/core'
import { PostgreSqlDriver, SchemaGenerator } from '@mikro-orm/postgresql'

import { OidcEntity, OidcSigningKey } from '../src/core/database'
import { MikroOrmAdapter, SIGNING_ALGS, SigningKeysService } from '../src/oidc'
import { initializeMikroOrm } from './helpers'

/**
 * Concurrency scenarios from docs/toctou-remediation-plan.md, run against the
 * real dev Postgres: advisory locks are held per connection, so the two
 * "replicas" here are two independent `MikroORM.init` instances — an
 * in-process mock proves nothing about cross-replica serialization.
 *
 * Opt-in like the other e2e suites: needs the dev Postgres
 * (docker-compose.dev.yml, port 5434); run with `yarn test:e2e`.
 */
describe.skipIf(process.env.E2E !== 'true')('E2E TOCTOU serialization', () => {
  const configStub = { oidcConfig: { jwks: undefined } } as any

  let ormSchemaGenerator: SchemaGenerator
  let replicaA: MikroORM<PostgreSqlDriver>
  let replicaB: MikroORM<PostgreSqlDriver>

  beforeAll(async () => {
    replicaA = await initializeMikroOrm()
    ormSchemaGenerator = replicaA.schema
    await ormSchemaGenerator.refresh()
    replicaB = await initializeMikroOrm()
  })

  afterAll(async () => {
    if (ormSchemaGenerator) await ormSchemaGenerator.clear()
    if (replicaB) await replicaB.close(true)
    if (replicaA) await replicaA.close(true)
  })

  beforeEach(async () => {
    const em = replicaA.em.fork()
    await em.nativeDelete(OidcSigningKey, {})
    await em.nativeDelete(OidcEntity, {})
  })

  test('two replicas booting against an empty database create exactly one active key per alg and publish identical JWKS', async () => {
    const serviceA = new SigningKeysService(replicaA.em, configStub)
    const serviceB = new SigningKeysService(replicaB.em, configStub)

    const [jwksA, jwksB] = await Promise.all([serviceA.getJwks(), serviceB.getJwks()])

    const active = await replicaA.em.fork().find(OidcSigningKey, { retiredAt: null })
    for (const alg of SIGNING_ALGS) {
      expect(active.filter((key) => key.alg === alg)).toHaveLength(1)
    }

    const kids = (jwks: { keys: Record<string, any>[] }) => jwks.keys.map((key) => key.kid).sort()
    expect(kids(jwksA)).toEqual(kids(jwksB))
    expect(kids(jwksA)).toEqual(active.map((key) => key.kid).sort())
  })

  test('concurrent retires of an algorithm’s two active keys: exactly one succeeds, one key stays active', async () => {
    const serviceA = new SigningKeysService(replicaA.em, configStub)
    const serviceB = new SigningKeysService(replicaB.em, configStub)

    await serviceA.getJwks() // one active key per alg
    await serviceA.rotateKey('RS256') // second active RS256 key
    const rsaKids = (await replicaA.em.fork().find(OidcSigningKey, { alg: 'RS256', retiredAt: null })).map((key) => key.kid)
    expect(rsaKids).toHaveLength(2)

    const results = await Promise.allSettled([serviceA.retireKey(rsaKids[0]), serviceB.retireKey(rsaKids[1])])

    const fulfilled = results.filter((result) => result.status === 'fulfilled')
    const rejected = results.filter((result) => result.status === 'rejected') as PromiseRejectedResult[]
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect(String(rejected[0].reason)).toMatch(/last active key/)

    const stillActive = await replicaA.em.fork().count(OidcSigningKey, { alg: 'RS256', retiredAt: null })
    expect(stillActive).toBe(1)
  })

  test('concurrent consumes of the same artifact: exactly one succeeds', async () => {
    const adapterA = new MikroOrmAdapter('AuthorizationCode', replicaA.em)
    const adapterB = new MikroOrmAdapter('AuthorizationCode', replicaB.em)

    await adapterA.upsert('race-code', { jti: 'race-code' }, 60)

    const results = await Promise.allSettled([adapterA.consume('race-code'), adapterB.consume('race-code')])

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)

    const row = await replicaA.em.fork().findOne(OidcEntity, { name: 'AuthorizationCode', id: 'race-code' })
    expect(row?.consumedAt).toBeInstanceOf(Date)
  })
})
