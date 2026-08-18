import { MikroORM } from '@mikro-orm/core'
import { PostgreSqlDriver, SchemaGenerator } from '@mikro-orm/postgresql'
import { INestApplication } from '@nestjs/common'
import { Server } from 'net'
import request from 'supertest'

import { OidcSigningKey } from '../src/core/database'
import { initializeMikroOrm, startTestApp } from './helpers'

// TODO: re-enable once CI provides a Postgres instance for e2e tests
describe.skip('E2E OIDC provider', () => {
  let ormSchemaGenerator: SchemaGenerator
  let orm: MikroORM<PostgreSqlDriver>

  let nestApp: INestApplication
  let app: Server

  beforeAll(async () => {
    orm = await initializeMikroOrm()
    ormSchemaGenerator = orm.schema

    await ormSchemaGenerator.refresh()

    nestApp = await startTestApp()
    app = nestApp.getHttpServer() as Server
  })

  afterAll(async () => {
    if (nestApp) await nestApp.close()
    if (ormSchemaGenerator) await ormSchemaGenerator.clear()
    if (orm) await orm.close(true)
  })

  test('serves discovery at the app root', async () => {
    const response = await request(app)
      .get('/.well-known/openid-configuration')
      .set('Host', 'localhost:3005')
      .expect(200)

    expect(response.body.issuer).toBe('http://localhost:3005')
    expect(response.body.jwks_uri).toBe('http://localhost:3005/jwks')
    expect(response.body.authorization_endpoint).toBe('http://localhost:3005/authorize')
  })

  test('serves the persisted signing keys on /jwks (public parts only)', async () => {
    const response = await request(app).get('/jwks').expect(200)

    const persisted = await orm.em.fork().find(OidcSigningKey, { retiredAt: null })
    expect(persisted.length).toBeGreaterThanOrEqual(2)

    const publishedKids = response.body.keys.map((key: any) => key.kid).sort()
    expect(publishedKids).toEqual(persisted.map((key) => key.kid).sort())
    for (const key of response.body.keys) {
      expect(key.d).toBeUndefined()
    }
  })

  test('Nest routes coexist with the mounted provider', async () => {
    // Nest keeps /health (Terminus) …
    const health = await request(app).get('/health')
    expect([200, 503]).toContain(health.status)
    expect(health.body.details ?? health.body.error).toBeDefined()

    // … and the /api surface (Swagger UI)
    await request(app)
      .get('/api/docs')
      .expect((res) => expect([200, 301, 302]).toContain(res.status))

    // everything else belongs to the provider (its plain 404, not Nest's JSON shape)
    const unknown = await request(app).get('/definitely-not-a-route').expect(404)
    expect(unknown.text).not.toContain('statusCode')
  })

  test('provider parses its own request bodies (no Nest body parser in front)', async () => {
    const response = await request(app).post('/token').type('form').send({ grant_type: 'authorization_code' })

    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(response.status).toBeLessThan(500)
    expect(response.body.error).toBeDefined()
  })
})
