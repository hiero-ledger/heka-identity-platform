import { MikroORM } from '@mikro-orm/core'
import { PostgreSqlDriver, SchemaGenerator } from '@mikro-orm/postgresql'
import { INestApplication } from '@nestjs/common'
import { Server } from 'net'
import request from 'supertest'

import { initializeMikroOrm, startTestApp } from './helpers'

// TODO: re-enable once CI provides a Postgres instance for e2e tests
describe.skip('E2E health', () => {
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

  test('GET /health reports ok', async () => {
    const response = await request(app).get('/health').expect(200)

    expect(response.body.status).toBe('ok')
    expect(response.body.details).toMatchObject({
      memory_heap: { status: 'up' },
      memory_rss: { status: 'up' },
      database: { status: 'up' },
    })
  })
})
