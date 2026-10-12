import { createServer, Server as HttpServer } from 'http'
import { AddressInfo, Server } from 'net'

import { MikroORM } from '@mikro-orm/core'
import { PostgreSqlDriver, SchemaGenerator } from '@mikro-orm/postgresql'
import { INestApplication } from '@nestjs/common'
import request from 'supertest'

import { sleep } from 'src/utils/timers'

import { initializeMikroOrm, startTestApp } from './helpers'

const RATE_LIMIT = 3

/**
 * Boots the real application with the demo-token broker pointed at a stub OIDC token endpoint:
 * checks the module wiring (config, throttler, controller) end to end.
 */
describe('E2E demo token broker', () => {
  let ormSchemaGenerator: SchemaGenerator
  let orm: MikroORM<PostgreSqlDriver>

  let nestApp: INestApplication
  let app: Server

  let tokenEndpoint: HttpServer
  const grants: Array<{ authorization?: string; form: Record<string, string> }> = []
  const originalEnv = { ...process.env }

  beforeAll(async () => {
    tokenEndpoint = createServer((req, res) => {
      let body = ''
      req.on('data', (chunk: Buffer) => (body += chunk.toString()))
      req.on('end', () => {
        grants.push({ authorization: req.headers.authorization, form: Object.fromEntries(new URLSearchParams(body)) })
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ access_token: `demo-token-${grants.length}`, token_type: 'Bearer', expires_in: 300 }))
      })
    })
    await new Promise<void>((resolve) => tokenEndpoint.listen(0, '127.0.0.1', resolve))
    const { port } = tokenEndpoint.address() as AddressInfo

    process.env.DEMO_TOKEN_URL = `http://127.0.0.1:${port}/token`
    process.env.DEMO_CLIENT_ID = 'heka-demo'
    process.env.DEMO_CLIENT_SECRET = 'demo-secret'
    process.env.DEMO_TOKEN_PARAMS = '{"audience":"https://heka-identity"}'
    process.env.DEMO_TOKEN_RATE_LIMIT = String(RATE_LIMIT)

    orm = await initializeMikroOrm()
    ormSchemaGenerator = orm.schema

    await ormSchemaGenerator.refresh()

    nestApp = await startTestApp()
    app = nestApp.getHttpServer() as Server
  })

  afterAll(async () => {
    // Give AFJ event listeners some time to process pending events
    await sleep(2000)

    await nestApp.close()

    await ormSchemaGenerator.clear()
    await orm.close(true)

    await new Promise<void>((resolve) => tokenEndpoint.close(() => resolve()))
    process.env = originalEnv
  })

  test('hands out the demo service account token obtained with Client Credentials, once per lifetime', async () => {
    const first = await request(app).get('/demo/token')
    const second = await request(app).get('/demo/token')

    expect(first.status).toBe(200)
    expect(first.headers['cache-control']).toBe('no-store')
    expect(first.body).toEqual({ access_token: 'demo-token-1', token_type: 'Bearer', expires_in: expect.any(Number) })
    expect(first.body.expires_in).toBeGreaterThan(290)
    expect(first.body.expires_in).toBeLessThanOrEqual(300)
    expect(second.body.access_token).toBe('demo-token-1')

    expect(grants).toHaveLength(1)
    expect(grants[0].authorization).toBeUndefined()
    expect(grants[0].form).toEqual({
      grant_type: 'client_credentials',
      client_id: 'heka-demo',
      client_secret: 'demo-secret',
      audience: 'https://heka-identity',
    })
  })

  test('rate-limits the endpoint per client', async () => {
    const statuses: number[] = []
    for (let i = 0; i < RATE_LIMIT + 1; i++) {
      statuses.push((await request(app).get('/demo/token')).status)
    }

    // The two requests of the previous test count towards the same window.
    expect(statuses).toContain(429)
    expect(statuses[statuses.length - 1]).toBe(429)
  })

  test('does not rate-limit the rest of the API', async () => {
    const response = await request(app).get('/health')

    expect(response.status).not.toBe(429)
  })
})
