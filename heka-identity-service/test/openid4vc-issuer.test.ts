import { Server } from 'net'

import { SchemaGenerator } from '@mikro-orm/sqlite'
import { INestApplication } from '@nestjs/common'
import request from 'supertest'

import { CredentialFormat } from 'openid4vc/issuer/dto/common/credential'
import { Role } from 'src/common/auth'
import { OpenId4VcIssuersCreateDto } from 'src/openid4vc/issuer/dto'
import { uuid } from 'src/utils/misc'
import { sleep } from 'src/utils/timers'

import { initializeMikroOrm, startTestApp } from './helpers'
import { createAuthToken } from './helpers/jwt'

describe('OpenId4VcIssuersController', () => {
  let ormSchemaGenerator: SchemaGenerator

  let nestApp: INestApplication
  let app: Server

  beforeAll(async () => {
    const orm = await initializeMikroOrm()
    ormSchemaGenerator = orm.getSchemaGenerator()
  })

  beforeEach(async () => {
    await ormSchemaGenerator.refreshDatabase()

    nestApp = await startTestApp()
    app = nestApp.getHttpServer() as Server
  })

  afterEach(async () => {
    // TODO: Find a way to explicitly await the required condition
    // Give AFJ event listeners some time to process pending events
    await sleep(5000)

    await nestApp.close()
  })

  afterAll(async () => {
    await ormSchemaGenerator.clearDatabase()
  })

  test('create issuer', async () => {
    const firstAdminId = uuid()
    const firstAdminAuthToken = await createAuthToken(firstAdminId, Role.Admin)
    const response = await request(app)
      .post(`/openid4vc/issuer/`)
      .auth(firstAdminAuthToken, { type: 'bearer' })
      .send({
        publicIssuerId: 'publicIssuerId',
        credentialsSupported: [
          {
            id: 'SdJwtVcExample',
            format: CredentialFormat.SdJwt,
            vct: 'https://example.com/vct',
            claims: { f1: {}, f2: {} },
          },
        ],
      } satisfies OpenId4VcIssuersCreateDto)

    expect(response.statusCode).toBe(200)
    expect(response.body).toEqual({
      accessTokenPublicKeyFingerprint: expect.any(String),
      createdAt: expect.any(String),
      credentialsSupported: [
        {
          format: 'vc+sd-jwt',
          id: 'SdJwtVcExample',
          vct: 'https://example.com/vct',
          claims: { f1: {}, f2: {} },
        },
      ],
      id: expect.any(String),
      publicIssuerId: expect.any(String),
      type: 'OpenId4VcIssuerRecord',
      updatedAt: expect.any(String),
    })
  })
})
