import { Server } from 'net'

import { MikroORM } from '@mikro-orm/core'
import { PostgreSqlDriver, SchemaGenerator } from '@mikro-orm/postgresql'
import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { vi } from 'vitest'

import { Role } from 'src/common/auth'

import { initializeMikroOrm, startTestApp } from './helpers'
import { createAuthToken } from './helpers/jwt'

// Set before the imports above run, which evaluate the app module and its `ConditionalModule`s. Set, not
// deleted: `.env` only fills unset variables, so a developer's `CONTRIBUTOR_VERIFICATION_ENABLED=true` can't apply.
const originalEnv = vi.hoisted(() => {
  const original = { ...process.env }
  process.env.CONTRIBUTOR_VERIFICATION_ENABLED = 'false'
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
    ['get', '/v2/contributor-credential/offer/6e7dce29-9d6a-4a13-a820-6a19b2ea9945'],
  ] as const)('%s %s is not registered (404)', async (method, path) => {
    const response = await request(app)[method](path).auth(token, { type: 'bearer' })

    // Nest's route-not-found answer, not a 404 from a registered handler
    expect(response.status).toBe(404)
    expect(response.body).toMatchObject({ message: `Cannot ${method.toUpperCase()} ${path}` })
  })
})
