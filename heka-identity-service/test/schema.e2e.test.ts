import * as fs from 'fs'
import { Server } from 'net'

import { SchemaGenerator } from '@mikro-orm/sqlite'
import { INestApplication } from '@nestjs/common'
import request from 'supertest'

import { Role } from 'common/auth'
import { DidMethod, OpenId4VCCredentialRegistrationFormat, ProtocolType } from 'common/types'
import { GetSchemasListRequest } from 'schema-v2/dto'
import { RegisterSchemaRequest } from 'schema-v2/dto/register-schema'
import { sleep } from 'src/utils/timers'
import { uuid } from 'utils/misc'

import { generateRandomString, initializeMikroOrm, startTestApp, UserUtilities, SchemaUtilities } from './helpers'
import { DidUtilities } from './helpers/did'
import { OpenID4VCIssuerUtilities } from './helpers/issuer'

describe('E2E schemas management', () => {
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
    await sleep(4000)

    await nestApp.close()
  })

  afterAll(async () => {
    await ormSchemaGenerator.clearDatabase()
  })

  describe('Schema.GetList', () => {
    test('UnauthorizedRequest.ReturnUnauthorized', async () => {
      const response = await request(app).get('/v2/schemas')
      expect(response.status).toBe(401)
    })

    test('ForbiddenRequest.WrongUser.ReturnEmptyList"', async () => {
      // Create the first user and his schema
      const firstUserAuthToken = await UserUtilities.register(app)
      expect(firstUserAuthToken).not.toBeUndefined()

      const schema = await SchemaUtilities.create(app, firstUserAuthToken!)
      expect(schema).toBeDefined()

      // Create the second user
      const secondUserAuthToken = await UserUtilities.register(app)
      expect(secondUserAuthToken).not.toBeUndefined()

      // Try to get schemas for second user
      const response = await request(app).get('/v2/schemas').auth(secondUserAuthToken!, { type: 'bearer' })

      // List should be empty
      expect(response.status).toBe(200)
      expect(response.body.total).toBe(0)
    })

    test('BadRequest.ReturnBadRequest"', async () => {
      // Create the user and his schema
      const userAuthToken = await UserUtilities.register(app)
      expect(userAuthToken).not.toBeUndefined()

      const schema = await SchemaUtilities.create(app, userAuthToken!)
      expect(schema).toBeDefined()

      // Try to get schemas
      const response = await request(app)
        .get('/v2/schemas')
        .auth(userAuthToken!, { type: 'bearer' })
        .query({ limit: -1, offset: -1, text: generateRandomString(51) } as GetSchemasListRequest)
        .send()

      // Should be bad request received
      expect(response.status).toBe(400)
    })

    test('OKRequest.Filter.Empty.ReturnList"', async () => {
      // Create the user and his schemas
      const userAuthToken = await UserUtilities.register(app)
      expect(userAuthToken).not.toBeUndefined()

      const schema1 = await SchemaUtilities.create(app, userAuthToken!)
      expect(schema1).toBeDefined()
      const schema2 = await SchemaUtilities.create(app, userAuthToken!)
      expect(schema2).toBeDefined()
      const schema3 = await SchemaUtilities.create(app, userAuthToken!)
      expect(schema3).toBeDefined()

      // Create the second user and his schemas
      const secondUserAuthToken = await UserUtilities.register(app)
      expect(secondUserAuthToken).not.toBeUndefined()

      const schema4 = await SchemaUtilities.create(app, secondUserAuthToken!)
      expect(schema4).toBeDefined()

      // Try to get schemas
      const response = await request(app).get('/v2/schemas').auth(userAuthToken!, { type: 'bearer' })

      // Should be returned 3 schemas
      expect(response.status).toBe(200)
      expect(response.body.total).toBe(3)
      expect(response.body.items[0].fields.length).toBe(schema1?.fields.length)
      expect(response.body.items[1].fields.length).toBe(schema2?.fields.length)
      expect(response.body.items[2].fields.length).toBe(schema3?.fields.length)
    })

    test('OKRequest.Filter.Hidden.ReturnList"', async () => {
      // Create the user and his schemas
      const userAuthToken = await UserUtilities.register(app)
      expect(userAuthToken).not.toBeUndefined()

      const schema1 = await SchemaUtilities.create(app, userAuthToken!)
      expect(schema1).toBeDefined()
      const schema2 = await SchemaUtilities.create(app, userAuthToken!)
      expect(schema2).toBeDefined()
      const schema3 = await SchemaUtilities.create(app, userAuthToken!)
      expect(schema3).toBeDefined()

      // Hide schema 1
      const done = await SchemaUtilities.setHidden(app, userAuthToken!, schema1?.id ?? uuid(), true)
      expect(done).toBe(true)

      // Try to get hidden schemas
      let response = await request(app)
        .get('/v2/schemas')
        .auth(userAuthToken!, { type: 'bearer' })
        .query({ isHidden: true } as GetSchemasListRequest)
        .send()

      // Should be returned 1 schema
      expect(response.status).toBe(200)
      expect(response.body.total).toBe(1)

      // Try to get visible schemas
      response = await request(app)
        .get('/v2/schemas')
        .auth(userAuthToken!, { type: 'bearer' })
        .query({ isHidden: false } as GetSchemasListRequest)
        .send()

      // Should be returned 2 schema
      expect(response.status).toBe(200)
      expect(response.body.total).toBe(2)
    })

    test('OKRequest.Filter.Text.ReturnList"', async () => {
      // Create the user and his schemas
      const userAuthToken = await UserUtilities.register(app)
      expect(userAuthToken).not.toBeUndefined()

      const schema1 = await SchemaUtilities.create(app, userAuthToken!, {
        name: 'Schema AAAA',
        fields: ['F1', 'F2'],
      })
      expect(schema1).toBeDefined()
      const schema2 = await SchemaUtilities.create(app, userAuthToken!, {
        name: 'Schema BBBB',
        fields: ['F1', 'F2'],
      })
      expect(schema2).toBeDefined()
      const schema3 = await SchemaUtilities.create(app, userAuthToken!, {
        name: 'Schema CCAA',
        fields: ['F1', 'F2'],
      })
      expect(schema3).toBeDefined()

      // Try to get schemas AA
      let response = await request(app)
        .get('/v2/schemas')
        .auth(userAuthToken!, { type: 'bearer' })
        .query({ text: 'AA' } as GetSchemasListRequest)
        .send()

      // Should be returned 2 schema
      expect(response.status).toBe(200)
      expect(response.body.total).toBe(2)

      // Try to get schemas BBBB
      response = await request(app)
        .get('/v2/schemas')
        .auth(userAuthToken!, { type: 'bearer' })
        .query({ text: 'BBBB' } as GetSchemasListRequest)
        .send()

      // Should be returned 1 schema
      expect(response.status).toBe(200)
      expect(response.body.total).toBe(1)

      // Try to get schemas CCCC
      response = await request(app)
        .get('/v2/schemas')
        .auth(userAuthToken!, { type: 'bearer' })
        .query({ text: 'CCCC' } as GetSchemasListRequest)
        .send()

      // Should be returned 0 schema
      expect(response.status).toBe(200)
      expect(response.body.total).toBe(0)
    })

    test('OKRequest.Paging.ReturnList"', async () => {
      // Create the user and his schemas
      const userAuthToken = await UserUtilities.register(app)
      expect(userAuthToken).not.toBeUndefined()

      const schema1 = await SchemaUtilities.create(app, userAuthToken!)
      expect(schema1).toBeDefined()
      const schema2 = await SchemaUtilities.create(app, userAuthToken!)
      expect(schema2).toBeDefined()
      const schema3 = await SchemaUtilities.create(app, userAuthToken!)
      expect(schema3).toBeDefined()
      const schema4 = await SchemaUtilities.create(app, userAuthToken!)
      expect(schema4).toBeDefined()
      const schema5 = await SchemaUtilities.create(app, userAuthToken!)
      expect(schema5).toBeDefined()

      // Try to get schemas, page 2
      let response = await request(app)
        .get('/v2/schemas')
        .auth(userAuthToken!, { type: 'bearer' })
        .query({ offset: 0, limit: 2 } as GetSchemasListRequest)
        .send()

      // Should be returned 2 schemas
      expect(response.status).toBe(200)
      expect(response.body.total).toBe(5)
      expect(response.body.items.length).toBe(2)
      expect(response.body.items[0].id).toBe(schema1!.id)
      expect(response.body.items[1].id).toBe(schema2!.id)

      // Try to get schemas, page 2
      response = await request(app)
        .get('/v2/schemas')
        .auth(userAuthToken!, { type: 'bearer' })
        .query({ offset: 2, limit: 2 } as GetSchemasListRequest)
        .send()

      // Should be returned 2 schemas
      expect(response.status).toBe(200)
      expect(response.body.total).toBe(5)
      expect(response.body.items.length).toBe(2)
      expect(response.body.items[0].id).toBe(schema3!.id)
      expect(response.body.items[1].id).toBe(schema4!.id)

      // Try to get schemas, page 3
      response = await request(app)
        .get('/v2/schemas')
        .auth(userAuthToken!, { type: 'bearer' })
        .query({ offset: 4, limit: 2 } as GetSchemasListRequest)
        .send()

      // Should be returned 1 schema
      expect(response.status).toBe(200)
      expect(response.body.total).toBe(5)
      expect(response.body.items.length).toBe(1)
      expect(response.body.items[0].id).toBe(schema5!.id)

      // Try to get schemas, page 4
      response = await request(app)
        .get('/v2/schemas')
        .auth(userAuthToken!, { type: 'bearer' })
        .query({ offset: 6, limit: 2 } as GetSchemasListRequest)
        .send()

      // Should be returned 1 schema
      expect(response.status).toBe(200)
      expect(response.body.items.length).toBe(0)
      expect(response.body.total).toBe(5)
    })
  })

  describe('Schema.GetById', () => {
    test('UnauthorizedRequest.ReturnUnauthorized', async () => {
      const uid = uuid()
      const response = await request(app).get(`/v2/schemas/${uid}`)
      expect(response.status).toBe(401)
    })

    test('ForbiddenRequest.WrongUser.ReturnNotFound"', async () => {
      // Create first user and his schema
      const firstUserAuthToken = await UserUtilities.register(app)
      expect(firstUserAuthToken).not.toBeUndefined()

      const schema = await SchemaUtilities.create(app, firstUserAuthToken!)
      expect(schema).toBeDefined()

      // Create second user
      const secondUserAuthToken = await UserUtilities.register(app)
      expect(secondUserAuthToken).not.toBeUndefined()

      // Try to get schema for second user
      const response = await request(app)
        .get(`/v2/schemas/${schema!.id}`)
        .auth(secondUserAuthToken!, { type: 'bearer' })

      // Schema shouldn't be found
      expect(response.status).toBe(404)
    })

    test('BadRequest.ReturnNotFound', async () => {
      // Create the user and his schemas
      const userAuthToken = await UserUtilities.register(app)
      expect(userAuthToken).not.toBeUndefined()

      // Try to get schema
      const response = await request(app).get(`/v2/schemas/${uuid()}`).auth(userAuthToken!, { type: 'bearer' })

      // Shouldn't be returned a schema
      expect(response.status).toBe(404)
    })

    test('OKRequest.ReturnSchema"', async () => {
      // Create the user and his schemas
      const userAuthToken = await UserUtilities.register(app)
      expect(userAuthToken).not.toBeUndefined()

      const schema1 = await SchemaUtilities.create(app, userAuthToken!)
      expect(schema1).toBeDefined()

      // Try to get schema
      const response = await request(app).get(`/v2/schemas/${schema1!.id}`).auth(userAuthToken!, { type: 'bearer' })

      // Should be returned schema details
      expect(response.status).toBe(200)
      expect(response.body.id).toBe(schema1?.id)
      expect(response.body.name).toBe(schema1?.name)
    })
  })

  describe('Schema.Create', () => {
    test('UnauthorizedRequest.ReturnUnauthorized', async () => {
      const response = await request(app).post('/v2/schemas')
      expect(response.status).toBe(401)
    })

    describe('BadRequest.Name', () => {
      test('Empty.ReturnBadRequest', async () => {
        const userAuthToken = await UserUtilities.register(app)
        expect(userAuthToken).not.toBeUndefined()

        const response = await request(app)
          .post('/v2/schemas')
          .auth(userAuthToken!, { type: 'bearer' })
          .set('Content-Type', 'multipart/form-data')
          .field('name', '')
          .field('fields', [uuid()])

        expect(response.status).toBe(400)
        expect(response.body.message).toContain('name must be longer than or equal to 1 characters')
      })

      test('Long.ReturnBadRequest', async () => {
        const userAuthToken = await UserUtilities.register(app)
        expect(userAuthToken).not.toBeUndefined()

        const response = await request(app)
          .post('/v2/schemas')
          .auth(userAuthToken!, { type: 'bearer' })
          .set('Content-Type', 'multipart/form-data')
          .field('name', generateRandomString(501))
          .field('fields', [uuid()])

        expect(response.status).toBe(400)
        expect(response.body.message).toContain('name must be shorter than or equal to 500 characters')
      })

      test('NotUnique.ReturnBadRequest', async () => {
        const userAuthToken = await UserUtilities.register(app)
        expect(userAuthToken).not.toBeUndefined()

        const schemaName = generateRandomString(30, true, true, false)

        let response = await request(app)
          .post('/v2/schemas')
          .auth(userAuthToken!, { type: 'bearer' })
          .set('Content-Type', 'multipart/form-data')
          .field('name', schemaName)
          .field('fields', [uuid()])

        expect(response.status).toBe(201)

        response = await request(app)
          .post('/v2/schemas')
          .auth(userAuthToken!, { type: 'bearer' })
          .set('Content-Type', 'multipart/form-data')
          .field('name', schemaName)
          .field('fields', [uuid()])

        expect(response.status).toBe(400)
        expect(response.body.message).toContain(`Schema with name ${schemaName} already exists.`)
      })
    })

    describe('BadRequest.Logo', () => {
      test('Size.ReturnBadRequest', async () => {
        const userAuthToken = await UserUtilities.register(app)
        expect(userAuthToken).not.toBeUndefined()

        const response = await request(app)
          .post('/v2/schemas')
          .auth(userAuthToken!, { type: 'bearer' })
          .set('Content-Type', 'multipart/form-data')
          .attach('logo', fs.readFileSync(`${__dirname}/assets/image_big.jpg`), 'image_big.jpg')
          .field('name', uuid())
          .field('fields', [uuid()])

        expect(response.status).toBe(400)
        expect(response.body.message).toContain('Maximum file size is 1 mb')
      })

      test('WrongExtension.ReturnBadRequest', async () => {
        const userAuthToken = await UserUtilities.register(app)
        expect(userAuthToken).not.toBeUndefined()

        const response = await request(app)
          .post('/v2/schemas')
          .auth(userAuthToken!, { type: 'bearer' })
          .set('Content-Type', 'multipart/form-data')
          .attach('logo', fs.readFileSync(`${__dirname}/assets/image.bmp`), 'image.bmp')
          .field('name', uuid())
          .field('fields', [uuid()])

        expect(response.status).toBe(400)
        expect(response.body.message).toContain('Unsupported file type: image.bmp')
      })
    })

    describe('OKRequest.Logo', () => {
      test('Size.Created.ReturnSchemaId', async () => {
        const userAuthToken = await UserUtilities.register(app)
        expect(userAuthToken).not.toBeUndefined()

        const response = await request(app)
          .post('/v2/schemas')
          .auth(userAuthToken!, { type: 'bearer' })
          .set('Content-Type', 'multipart/form-data')
          .attach('logo', fs.readFileSync(`${__dirname}/assets/image.jpg`), 'image.jpg')
          .field('name', uuid())
          .field('fields', [uuid()])

        expect(response.status).toBe(201)
      })

      test('EnabledExtension.Created.ReturnSchemaId', async () => {
        const userAuthToken = await UserUtilities.register(app)
        expect(userAuthToken).not.toBeUndefined()

        const files = ['image.jpeg', 'image.jpg', 'image.png']
        for (const f of files) {
          const response = await request(app)
            .post('/v2/schemas')
            .auth(userAuthToken!, { type: 'bearer' })
            .set('Content-Type', 'multipart/form-data')
            .attach('logo', fs.readFileSync(`${__dirname}/assets/${f}`), f)
            .field('name', uuid())
            .field('fields', [uuid()])
          expect(response.status).toBe(201)
        }
      })
    })

    test('BadRequest.BGColor.ReturnBadRequest', async () => {
      const userAuthToken = await UserUtilities.register(app)
      expect(userAuthToken).not.toBeUndefined()

      const response = await request(app)
        .post('/v2/schemas')
        .auth(userAuthToken!, { type: 'bearer' })
        .set('Content-Type', 'multipart/form-data')
        .field('name', uuid())
        .field('bgColor', uuid())
        .field('fields', [uuid()])

      expect(response.status).toBe(400)
      expect(response.body.message).toContain('bgColor must be a hexadecimal color')
    })

    test('OKRequest.BGColor.Created.ReturnSchemaId', async () => {
      const userAuthToken = await UserUtilities.register(app)
      expect(userAuthToken).not.toBeUndefined()

      const response = await request(app)
        .post('/v2/schemas')
        .auth(userAuthToken!, { type: 'bearer' })
        .set('Content-Type', 'multipart/form-data')
        .field('name', uuid())
        .field('bgColor', 'FFFFFF')
        .field('fields', [uuid()])

      expect(response.status).toBe(201)
    })

    describe('BadRequest.Fields', () => {
      test('Empty.ReturnBadRequest', async () => {
        const userAuthToken = await UserUtilities.register(app)
        expect(userAuthToken).not.toBeUndefined()

        const response = await request(app)
          .post('/v2/schemas')
          .auth(userAuthToken!, { type: 'bearer' })
          .set('Content-Type', 'multipart/form-data')
          .field('name', uuid())
          .field('fields', [])

        expect(response.status).toBe(400)
        expect(response.body.message).toContain('fields should not be empty')
      })

      test('NotUnique.ReturnBadRequest', async () => {
        const userAuthToken = await UserUtilities.register(app)
        expect(userAuthToken).not.toBeUndefined()

        const response = await request(app)
          .post('/v2/schemas')
          .auth(userAuthToken!, { type: 'bearer' })
          .set('Content-Type', 'multipart/form-data')
          .field('name', uuid())
          .field('fields', ['F1', 'F2', 'F1'])

        expect(response.status).toBe(400)
        expect(response.body.message).toContain("All field's elements must be unique")
      })
    })

    test('OKRequest.Complete.Created.ReturnSchemaId"', async () => {
      const userAuthToken = await UserUtilities.register(app)
      expect(userAuthToken).not.toBeUndefined()

      const response = await request(app)
        .post('/v2/schemas')
        .auth(userAuthToken!, { type: 'bearer' })
        .set('Content-Type', 'multipart/form-data')
        .attach('logo', fs.readFileSync(`${__dirname}/assets/image.jpg`), 'image.jpg')
        .field('name', uuid())
        .field('bgColor', 'ffffff')
        .field('fields', [uuid(), uuid(), uuid()])

      expect(response.status).toBe(201)
      expect(response.body.id).toBeDefined()
    })
  })

  describe('Schema.Patch', () => {
    test('UnauthorizedRequest.ReturnUnauthorized', async () => {
      const uid = uuid()
      const response = await request(app).patch(`/v2/schemas/${uid}`)
      expect(response.status).toBe(401)
    })

    test('ForbiddenRequest.WrongUser.ReturnNotFound"', async () => {
      // Create first user and his schema
      const firstUserAuthToken = await UserUtilities.register(app)
      expect(firstUserAuthToken).toBeDefined()

      const schema = await SchemaUtilities.create(app, firstUserAuthToken!)
      expect(schema).toBeDefined()

      // Create second user
      const secondUserAuthToken = await UserUtilities.register(app)
      expect(secondUserAuthToken).not.toBeUndefined()

      // Try to get schema for second user
      const response = await request(app)
        .patch(`/v2/schemas/${schema!.id}`)
        .auth(secondUserAuthToken!, { type: 'bearer' })

      // Schema shouldn't be found
      expect(response.status).toBe(404)
    })

    test('OKRequest.InvalidSchemaId.ReturnNotFound"', async () => {
      // Create user
      const userAuthToken = await UserUtilities.register(app)
      expect(userAuthToken).toBeDefined()

      // Try to get schema for second user
      const response = await request(app).patch(`/v2/schemas/${uuid()}`).auth(userAuthToken!, { type: 'bearer' })

      // Schema shouldn't be found
      expect(response.status).toBe(404)
    })

    describe('BadRequest.Logo', () => {
      test('Size.ReturnBadRequest', async () => {
        const userAuthToken = await UserUtilities.register(app)
        expect(userAuthToken).not.toBeUndefined()

        const schema1 = await SchemaUtilities.create(app, userAuthToken!)
        expect(schema1).toBeDefined()

        const response = await request(app)
          .patch(`/v2/schemas/${schema1}`)
          .auth(userAuthToken!, { type: 'bearer' })
          .set('Content-Type', 'multipart/form-data')
          .attach('logo', fs.readFileSync(`${__dirname}/assets/image_big.jpg`), 'image_big.jpg')

        expect(response.status).toBe(400)
        expect(response.body.message).toContain('Maximum file size is 1 mb')
      })

      test('WrongExtension.ReturnBadRequest', async () => {
        const userAuthToken = await UserUtilities.register(app)
        expect(userAuthToken).not.toBeUndefined()

        const schema1 = await SchemaUtilities.create(app, userAuthToken!)
        expect(schema1).toBeDefined()

        const response = await request(app)
          .patch(`/v2/schemas/${schema1}`)
          .auth(userAuthToken!, { type: 'bearer' })
          .set('Content-Type', 'multipart/form-data')
          .attach('logo', fs.readFileSync(`${__dirname}/assets/image.bmp`), 'image.bmp')

        expect(response.status).toBe(400)
        expect(response.body.message).toContain('Unsupported file type: image.bmp')
      })
    })

    describe('OKRequest.Logo', () => {
      test('Size.Updated.ReturnSchemaId', async () => {
        const userAuthToken = await UserUtilities.register(app)
        expect(userAuthToken).not.toBeUndefined()

        const schema = await SchemaUtilities.create(app, userAuthToken!)
        expect(schema).toBeDefined()

        const response = await request(app)
          .patch(`/v2/schemas/${schema?.id}`)
          .auth(userAuthToken!, { type: 'bearer' })
          .set('Content-Type', 'multipart/form-data')
          .attach('logo', fs.readFileSync(`${__dirname}/assets/image.jpg`), 'image.jpg')

        expect(response.status).toBe(200)
      })

      test('EnabledExtension.Updated.ReturnSchemaId', async () => {
        const userAuthToken = await UserUtilities.register(app)
        expect(userAuthToken).not.toBeUndefined()

        const schema = await SchemaUtilities.create(app, userAuthToken!)
        expect(schema).toBeDefined()

        const files = ['image.jpeg', 'image.jpg', 'image.png']
        for (const f of files) {
          const response = await request(app)
            .patch(`/v2/schemas/${schema?.id}`)
            .auth(userAuthToken!, { type: 'bearer' })
            .set('Content-Type', 'multipart/form-data')
            .attach('logo', fs.readFileSync(`${__dirname}/assets/${f}`), f)

          expect(response.status).toBe(200)
        }
      })
    })

    test('BadRequest.BGColor.ReturnBadRequest', async () => {
      const userAuthToken = await UserUtilities.register(app)
      expect(userAuthToken).not.toBeUndefined()

      const schema = await SchemaUtilities.create(app, userAuthToken!)
      expect(schema).toBeDefined()

      const response = await request(app)
        .patch(`/v2/schemas/${schema?.id}`)
        .auth(userAuthToken!, { type: 'bearer' })
        .set('Content-Type', 'multipart/form-data')
        .field('bgColor', uuid())

      expect(response.status).toBe(400)
      expect(response.body.message).toContain('bgColor must be a hexadecimal color')
    })

    test('OKRequest.BGColor.Updated.ReturnOK', async () => {
      const userAuthToken = await UserUtilities.register(app)
      expect(userAuthToken).not.toBeUndefined()

      const schema = await SchemaUtilities.create(app, userAuthToken!)
      expect(schema).toBeDefined()

      const color = 'FFFFFF'

      const response = await request(app)
        .patch(`/v2/schemas/${schema?.id}`)
        .auth(userAuthToken!, { type: 'bearer' })
        .set('Content-Type', 'multipart/form-data')
        .field('bgColor', color)

      expect(response.status).toBe(200)

      const patchedSchema = await SchemaUtilities.get(app, userAuthToken!, schema!.id)
      expect(patchedSchema.bgColor).toBe(color)
    })

    test('BadRequest.Hidden.ReturnBadRequest', async () => {
      const userAuthToken = await UserUtilities.register(app)
      expect(userAuthToken).not.toBeUndefined()

      const schema = await SchemaUtilities.create(app, userAuthToken!)
      expect(schema).toBeDefined()

      const response = await request(app)
        .patch(`/v2/schemas/${schema?.id}`)
        .auth(userAuthToken!, { type: 'bearer' })
        .set('Content-Type', 'multipart/form-data')
        .field('isHidden', uuid())

      expect(response.status).toBe(400)
      expect(response.body.message).toContain('isHidden must be a boolean value')
    })

    test('OKRequest.Hidden.Changed.ReturnOK', async () => {
      const userAuthToken = await UserUtilities.register(app)
      expect(userAuthToken).not.toBeUndefined()

      const schema = await SchemaUtilities.create(app, userAuthToken!)
      expect(schema).toBeDefined()

      let response = await request(app)
        .patch(`/v2/schemas/${schema?.id}`)
        .auth(userAuthToken!, { type: 'bearer' })
        .set('Content-Type', 'multipart/form-data')
        .field('isHidden', true)

      expect(response.status).toBe(200)

      let patchedSchema = await SchemaUtilities.get(app, userAuthToken!, schema!.id)
      expect(patchedSchema.isHidden).toBe(true)

      response = await request(app)
        .patch(`/v2/schemas/${schema?.id}`)
        .auth(userAuthToken!, { type: 'bearer' })
        .set('Content-Type', 'multipart/form-data')
        .field('isHidden', false)

      expect(response.status).toBe(200)

      patchedSchema = await SchemaUtilities.get(app, userAuthToken!, schema!.id)
      expect(patchedSchema.isHidden).toBe(false)
    })

    describe('BadRequest.Position', () => {
      test('WrongPreviousSchema.ReturnBadRequest', async () => {
        const userAuthToken = await UserUtilities.register(app)
        expect(userAuthToken).not.toBeUndefined()

        const schema = await SchemaUtilities.create(app, userAuthToken!)
        expect(schema).toBeDefined()

        const response = await request(app)
          .patch(`/v2/schemas/${schema?.id}`)
          .auth(userAuthToken!, { type: 'bearer' })
          .set('Content-Type', 'multipart/form-data')
          .field('position', uuid())

        expect(response.status).toBe(400)
        expect(response.body.message).toContain('property position should not exist')
      })

      test('NotOwnPreviousSchema.ReturnBadRequest', async () => {
        const firstUserAuthToken = await UserUtilities.register(app)
        expect(firstUserAuthToken).not.toBeUndefined()

        const schema1 = await SchemaUtilities.create(app, firstUserAuthToken!)
        expect(schema1).toBeDefined()

        const secondUserAuthToken = await UserUtilities.register(app)
        expect(secondUserAuthToken).not.toBeUndefined()

        const schema2 = await SchemaUtilities.create(app, secondUserAuthToken!)
        expect(schema2).toBeDefined()

        const response = await request(app)
          .patch(`/v2/schemas/${schema1?.id}`)
          .auth(firstUserAuthToken!, { type: 'bearer' })
          .set('Content-Type', 'multipart/form-data')
          .field('position', schema2!.id)

        expect(response.status).toBe(400)
        expect(response.body.message).toContain('property position should not exist')
      })
    })

    describe('OKRequest.Position', () => {
      test('ToFirst.Moved.ReturnOK', async () => {
        const userAuthToken = await UserUtilities.register(app)
        expect(userAuthToken).toBeDefined()

        const schema1 = await SchemaUtilities.create(app, userAuthToken!)
        expect(schema1).toBeDefined()
        const schema2 = await SchemaUtilities.create(app, userAuthToken!)
        expect(schema2).toBeDefined()
        const schema3 = await SchemaUtilities.create(app, userAuthToken!)
        expect(schema3).toBeDefined()
        const schema4 = await SchemaUtilities.create(app, userAuthToken!)
        expect(schema4).toBeDefined()

        const response = await request(app)
          .patch(`/v2/schemas/${schema3?.id}`)
          .auth(userAuthToken!, { type: 'bearer' })
          .set('Content-Type', 'multipart/form-data')
          .field('previousSchemaId', '')

        expect(response.status).toBe(200)

        const list = await SchemaUtilities.getList(app, userAuthToken!)

        expect(list.items.length).toBe(4)

        expect(list.items[0].id).toBe(schema3?.id)
        expect(list.items[0].orderIndex).toBe(0)

        expect(list.items[1].id).toBe(schema1?.id)
        expect(list.items[1].orderIndex).toBe(1)

        expect(list.items[2].id).toBe(schema2?.id)
        expect(list.items[2].orderIndex).toBe(2)

        expect(list.items[3].id).toBe(schema4?.id)
        expect(list.items[3].orderIndex).toBe(3)
      })

      test('AfterSchema.Moved.ReturnOK', async () => {
        const userAuthToken = await UserUtilities.register(app)
        expect(userAuthToken).toBeDefined()

        const schema1 = await SchemaUtilities.create(app, userAuthToken!)
        expect(schema1).toBeDefined()
        const schema2 = await SchemaUtilities.create(app, userAuthToken!)
        expect(schema2).toBeDefined()
        const schema3 = await SchemaUtilities.create(app, userAuthToken!)
        expect(schema3).toBeDefined()
        const schema4 = await SchemaUtilities.create(app, userAuthToken!)
        expect(schema4).toBeDefined()

        const response = await request(app)
          .patch(`/v2/schemas/${schema3?.id}`)
          .auth(userAuthToken!, { type: 'bearer' })
          .set('Content-Type', 'multipart/form-data')
          .field('previousSchemaId', schema1!.id)

        expect(response.status).toBe(200)

        const list = await SchemaUtilities.getList(app, userAuthToken!)

        expect(list.items.length).toBe(4)

        expect(list.items[0].id).toBe(schema1?.id)
        expect(list.items[0].orderIndex).toBe(0)

        expect(list.items[1].id).toBe(schema3?.id)
        expect(list.items[1].orderIndex).toBe(1)

        expect(list.items[2].id).toBe(schema2?.id)
        expect(list.items[2].orderIndex).toBe(2)

        expect(list.items[3].id).toBe(schema4?.id)
        expect(list.items[3].orderIndex).toBe(3)
      })

      test('DoHide.DoMove.DoShow.DoMove.Moved.ReturnOK', async () => {
        // first step: create 7 schemas ()
        // second step: hide 3 last schemas (5,6,7)
        // thirds step: move 3 schema after 1. Should be gotten 4 visible schemas (1,3,2,4)
        // fourth step: move 6 schema after 7. Should be gotten 3 hidden schemas (5,7,6)
        // five step: show 7 schema and move it after 3. Should be gotten 5 visible schemas (1,3,7,2,4)
        // six step: hide 1 schema and move it after 5. Should be gotten 3 hidden schemas (5,1,6)

        const userAuthToken = await UserUtilities.register(app)
        expect(userAuthToken).toBeDefined()

        // step 1
        const schema1 = await SchemaUtilities.create(app, userAuthToken!, { name: 'schema1', fields: [uuid()] })
        expect(schema1).toBeDefined()
        const schema2 = await SchemaUtilities.create(app, userAuthToken!, { name: 'schema2', fields: [uuid()] })
        expect(schema2).toBeDefined()
        const schema3 = await SchemaUtilities.create(app, userAuthToken!, { name: 'schema3', fields: [uuid()] })
        expect(schema3).toBeDefined()
        const schema4 = await SchemaUtilities.create(app, userAuthToken!, { name: 'schema4', fields: [uuid()] })
        expect(schema4).toBeDefined()
        const schema5 = await SchemaUtilities.create(app, userAuthToken!, { name: 'schema5', fields: [uuid()] })
        expect(schema5).toBeDefined()
        const schema6 = await SchemaUtilities.create(app, userAuthToken!, { name: 'schema6', fields: [uuid()] })
        expect(schema6).toBeDefined()
        const schema7 = await SchemaUtilities.create(app, userAuthToken!, { name: 'schema7', fields: [uuid()] })
        expect(schema7).toBeDefined()

        // step 2
        let done = await SchemaUtilities.setHidden(app, userAuthToken!, schema5!.id, true)
        expect(done).toBe(true)
        done = await SchemaUtilities.setHidden(app, userAuthToken!, schema6!.id, true)
        expect(done).toBe(true)
        done = await SchemaUtilities.setHidden(app, userAuthToken!, schema7!.id, true)
        expect(done).toBe(true)

        // step 3
        let response = await request(app)
          .patch(`/v2/schemas/${schema3?.id}`)
          .auth(userAuthToken!, { type: 'bearer' })
          .set('Content-Type', 'multipart/form-data')
          .field('previousSchemaId', schema1!.id)

        expect(response.status).toBe(200)

        let list = await SchemaUtilities.getList(app, userAuthToken!, { isHidden: false })

        expect(list.items.length).toBe(4)

        expect(list.items[0].id).toBe(schema1?.id)
        expect(list.items[0].orderIndex).toBe(0)

        expect(list.items[1].id).toBe(schema3?.id)
        expect(list.items[1].orderIndex).toBe(1)

        expect(list.items[2].id).toBe(schema2?.id)
        expect(list.items[2].orderIndex).toBe(2)

        expect(list.items[3].id).toBe(schema4?.id)
        expect(list.items[3].orderIndex).toBe(3)

        // step 4
        response = await request(app)
          .patch(`/v2/schemas/${schema6?.id}`)
          .auth(userAuthToken!, { type: 'bearer' })
          .set('Content-Type', 'multipart/form-data')
          .field('previousSchemaId', schema7!.id)

        expect(response.status).toBe(200)

        list = await SchemaUtilities.getList(app, userAuthToken!, { isHidden: true })

        expect(list.items.length).toBe(3)

        expect(list.items[0].id).toBe(schema5?.id)
        expect(list.items[0].orderIndex).toBe(0)

        expect(list.items[1].id).toBe(schema7?.id)
        expect(list.items[1].orderIndex).toBe(1)

        expect(list.items[2].id).toBe(schema6?.id)
        expect(list.items[2].orderIndex).toBe(2)

        // step 5
        done = await SchemaUtilities.setHidden(app, userAuthToken!, schema7!.id, false)
        expect(done).toBe(true)

        response = await request(app)
          .patch(`/v2/schemas/${schema7?.id}`)
          .auth(userAuthToken!, { type: 'bearer' })
          .set('Content-Type', 'multipart/form-data')
          .field('previousSchemaId', schema3!.id)

        expect(response.status).toBe(200)

        list = await SchemaUtilities.getList(app, userAuthToken!, { isHidden: false })

        expect(list.items.length).toBe(5)

        expect(list.items[0].id).toBe(schema1?.id)
        expect(list.items[0].orderIndex).toBe(0)

        expect(list.items[1].id).toBe(schema3?.id)
        expect(list.items[1].orderIndex).toBe(1)

        expect(list.items[2].id).toBe(schema7?.id)
        expect(list.items[2].orderIndex).toBe(2)

        expect(list.items[3].id).toBe(schema2?.id)
        expect(list.items[3].orderIndex).toBe(3)

        expect(list.items[4].id).toBe(schema4?.id)
        expect(list.items[4].orderIndex).toBe(4)

        // step 6
        done = await SchemaUtilities.setHidden(app, userAuthToken!, schema1!.id, true)
        expect(done).toBe(true)

        response = await request(app)
          .patch(`/v2/schemas/${schema1?.id}`)
          .auth(userAuthToken!, { type: 'bearer' })
          .set('Content-Type', 'multipart/form-data')
          .field('previousSchemaId', schema5!.id)

        expect(response.status).toBe(200)

        list = await SchemaUtilities.getList(app, userAuthToken!, { isHidden: true })

        expect(list.items.length).toBe(3)

        expect(list.items[0].id).toBe(schema5?.id)
        expect(list.items[0].orderIndex).toBe(0)

        expect(list.items[1].id).toBe(schema1?.id)
        expect(list.items[1].orderIndex).toBe(1)

        expect(list.items[2].id).toBe(schema6?.id)
        expect(list.items[2].orderIndex).toBe(2)
      })
    })
  })

  test('OKRequest.LogoAndBGColor.UpdateSupportedCredentialsDisplay', async () => {
    const userAuthToken = await UserUtilities.register(app, { role: Role.Admin })
    expect(userAuthToken).not.toBeUndefined()

    const schema = await SchemaUtilities.create(app, userAuthToken!)
    expect(schema).toBeDefined()

    const did = await DidUtilities.create(app, userAuthToken!, DidMethod.Key)
    expect(did).toBeDefined()

    const issuer = await OpenID4VCIssuerUtilities.create(app, userAuthToken!, {
      publicIssuerId: did?.id,
    })
    expect(issuer).toBeDefined()

    // register schema for all formats for Oid4vc
    for (const format of Object.values(OpenId4VCCredentialRegistrationFormat)) {
      const response = await request(app)
        .post(`/v2/schemas/${schema!.id}/registration`)
        .auth(userAuthToken!, { type: 'bearer' })
        .send({
          protocol: ProtocolType.Oid4vc,
          credentialFormat: format,
          network: DidMethod.Key,
          did: did!.id,
        } as RegisterSchemaRequest)
      expect(response.status).toBe(201)
    }

    // patch schema
    const response = await request(app)
      .patch(`/v2/schemas/${schema?.id}`)
      .auth(userAuthToken!, { type: 'bearer' })
      .set('Content-Type', 'multipart/form-data')
      .attach('logo', fs.readFileSync(`${__dirname}/assets/image.jpg`), 'image.jpg')
      .field('bgColor', '012345')
    expect(response.status).toBe(200)

    // get schema
    const newSchema = await SchemaUtilities.get(app, userAuthToken!, schema!.id)

    // check changes
    const issuers = await OpenID4VCIssuerUtilities.find(app, userAuthToken!, did!.id)
    expect(issuers[0]).toBeDefined()

    for (const credential of issuers[0].credentialsSupported) {
      expect(credential.display).toBeDefined()

      let display = undefined
      if (!Array.isArray(credential.display)) {
        display = credential.display
      } else {
        display = credential.display[0]
      }

      // @ts-ignore
      expect(display.logo?.url).toBe(newSchema.logo)
      // @ts-ignore
      expect(display.background_color).toBe(newSchema.bgColor)
    }
  })
})
