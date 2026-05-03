import { Server } from 'net'

import { SchemaGenerator } from '@mikro-orm/sqlite'
import { INestApplication } from '@nestjs/common'
import request from 'supertest'

import { initializeMikroOrm, startTestApp } from './helpers'

describe('Rate limiting', () => {
  let ormSchemaGenerator: SchemaGenerator
  let nestApp: INestApplication
  let app: Server

  beforeAll(async () => {
    const orm = await initializeMikroOrm()
    ormSchemaGenerator = orm.getSchemaGenerator()
    await ormSchemaGenerator.refreshDatabase()
    nestApp = await startTestApp()
    app = nestApp.getHttpServer() as Server
  })

  afterAll(async () => {
    await nestApp.close()
    await ormSchemaGenerator.clearDatabase()
  })

  test('POST /api/v1/oauth/token blocked after 5 attempts', async () => {
    const payload = { name: 'bruteforce_token', password: 'wrong' }
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/v1/oauth/token').send(payload)
    }
    const blocked = await request(app).post('/api/v1/oauth/token').send(payload)
    expect(blocked.status).toBe(429)
  })

  test('POST /api/v1/user/register blocked after 5 attempts', async () => {
    const payload = { name: 'ratelimituser', password: 'Password1234!', role: 'Issuer' }
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/v1/user/register').send(payload)
    }
    const blocked = await request(app).post('/api/v1/user/register').send(payload)
    expect(blocked.status).toBe(429)
  })

  test('POST /api/v1/user/password/change-request blocked after 3 attempts', async () => {
    const payload = { name: 'bruteforce_changereq' }
    for (let i = 0; i < 3; i++) {
      await request(app).post('/api/v1/user/password/change-request').send(payload)
    }
    const blocked = await request(app).post('/api/v1/user/password/change-request').send(payload)
    expect(blocked.status).toBe(429)
  })
})
