import { MikroORM } from '@mikro-orm/core'
import { PostgreSqlDriver, SchemaGenerator } from '@mikro-orm/postgresql'
import { INestApplication } from '@nestjs/common'

import { initializeMikroOrm, startTestApp } from './helpers'

describe('E2E health', () => {
  let ormSchemaGenerator: SchemaGenerator
  let orm: MikroORM<PostgreSqlDriver>

  let nestApp: INestApplication
  //let app: Server

  beforeAll(async () => {
    orm = await initializeMikroOrm()
    ormSchemaGenerator = orm.schema

    await ormSchemaGenerator.refresh()

    nestApp = await startTestApp()
    //app = nestApp.getHttpServer() as Server
  })

  afterAll(async () => {
    if (nestApp) await nestApp.close()
    if (ormSchemaGenerator) await ormSchemaGenerator.clear()
    if (orm) await orm.close(true)
  })

  /*test('GET /health reports ok', async () => {
    const response = await request(app).get('/health').expect(200)

    expect(response.body.status).toBe('ok')
    expect(response.body.details).toMatchObject({
      memory_heap: { status: 'up' },
      memory_rss: { status: 'up' },
      database: { status: 'up' },
    })
  })*/
})
