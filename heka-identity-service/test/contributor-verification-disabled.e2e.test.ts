import { Server } from 'net'

import { MikroORM } from '@mikro-orm/core'
import { PostgreSqlDriver, SchemaGenerator } from '@mikro-orm/postgresql'
import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { vi } from 'vitest'

import { Role } from 'src/common/auth'

import { initializeMikroOrm, startTestApp } from './helpers'
import { createAuthToken } from './helpers/jwt'

// The default: `ConditionalModule` reads the flag when the app module is evaluated, before the imports above run
const originalEnv = vi.hoisted(() => {
  const original = { ...process.env }
  delete process.env.CONTRIBUTOR_VERIFICATION_ENABLED
  return original
})

/** Contributor verification is optional and off by default: none of its routes exist. */
describe('E2E contributor verification disabled', () => {
  let ormSchemaGenerator: SchemaGenerator
  let orm: MikroORM<PostgreSqlDriver>
  let nestApp: INestApplication
  let app: Server
  let token: string

  beforeAll(async () => {
    orm = await initializeMikroOrm()
    ormSchemaGenerator = orm.schema
    await ormSchemaGenerator.refresh()

    nestApp = await startTestApp()
    app = nestApp.getHttpServer() as Server
    token = await createAuthToken('contributor-disabled', Role.User)
  })

  afterAll(async () => {
    await nestApp?.close()
    await ormSchemaGenerator?.clear()
    await orm?.close(true)
    process.env = originalEnv
  })

  test.each([
    ['get', '/v2/contributor-onboarding/status'],
    ['post', '/v2/contributor-onboarding/github/link/start'],
    ['post', '/v2/contributor-onboarding/github/link/callback'],
    ['delete', '/v2/contributor-onboarding/github'],
    ['post', '/v2/gpg-challenge/request'],
    ['post', '/v2/gpg-challenge/verify'],
    ['post', '/v2/contributor-credential/offer'],
  ] as const)('%s %s is not registered (404)', async (method, path) => {
    const response = await request(app)[method](path).auth(token, { type: 'bearer' })

    expect(response.status).toBe(404)
  })
})
