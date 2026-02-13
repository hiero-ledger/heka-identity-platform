import { Server } from 'net'

import { SchemaGenerator } from '@mikro-orm/sqlite'
import { INestApplication } from '@nestjs/common'
import request from 'supertest'

import { AriesCredentialFormat, DidMethod, OpenId4VcCredentialFormat, ProtocolType } from 'common/types'
import { CreateSchemaRequest, CreateSchemaResponse, GetSchemasListRequest } from 'schema-v2/dto'
import { Schema } from 'schema-v2/dto/common/schema'
import { sleep } from 'src/utils/timers'
import { uuid } from 'utils/misc'
import {
  CreateVerificationTemplateFieldRequest,
  CreateVerificationTemplateRequest,
  CreateVerificationTemplateResponse,
  GetVerificationTemplatesListRequest,
  PatchVerificationTemplateFieldRequest,
  PatchVerificationTemplateRequest,
} from 'verification-template/dto'

import { generateRandomString, initializeMikroOrm, SchemaUtilities, startTestApp, UserUtilities } from './helpers'
import { VerificationTemplateUtilities } from './helpers/verification-template'

describe('E2E verification templates management', () => {
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

  const createTestSchema = async (
    authToken: string,
    schemaRequest?: Partial<CreateSchemaRequest>,
  ): Promise<CreateSchemaResponse | undefined> => {
    const schemaReq = { ...SchemaUtilities.makeCreateSchemaRequest(), ...schemaRequest }
    const schema = await SchemaUtilities.create(app, authToken, schemaReq)
    expect(schema).toBeDefined()

    return schema
  }

  const createTestVerificationTemplate = async (
    authToken: string,
    schemaRequest?: Partial<CreateSchemaRequest>,
    templateRequest?: Partial<CreateVerificationTemplateRequest>,
  ): Promise<CreateVerificationTemplateResponse | undefined> => {
    let schema: Schema | undefined
    if (!templateRequest?.schemaId) {
      const schemaReq = { ...SchemaUtilities.makeCreateSchemaRequest(), ...schemaRequest }
      schema = await SchemaUtilities.create(app, authToken, schemaReq)
    } else {
      schema = await SchemaUtilities.get(app, authToken, templateRequest.schemaId)
    }
    expect(schema).toBeDefined()

    const templateReq = { ...VerificationTemplateUtilities.makeCreateTemplateRequest(), ...templateRequest }
    const template = await VerificationTemplateUtilities.create(app, authToken, {
      ...templateReq,
      schemaId: schema?.id,
      fields: schema?.fields.map((f) => ({ schemaFieldId: f.id }) as CreateVerificationTemplateFieldRequest),
    })
    expect(template).toBeDefined()

    return template
  }

  describe('VerificationTemplate.GetList', () => {
    test('UnauthorizedRequest.ReturnUnauthorized', async () => {
      const response = await request(app).get('/verification-templates')
      expect(response.status).toBe(401)
    })

    test('ForbiddenRequest.WrongUser.ReturnEmptyList"', async () => {
      const firstUserAuthToken = await UserUtilities.register(app)
      expect(firstUserAuthToken).not.toBeUndefined()

      await createTestVerificationTemplate(firstUserAuthToken!)

      const secondUserAuthToken = await UserUtilities.register(app)
      expect(secondUserAuthToken).not.toBeUndefined()

      const response = await request(app).get('/verification-templates').auth(secondUserAuthToken!, { type: 'bearer' })

      expect(response.status).toBe(200)
      expect(response.body.total).toBe(0)
    })

    test('BadRequest.ReturnBadRequest"', async () => {
      const userAuthToken = await UserUtilities.register(app)
      expect(userAuthToken).not.toBeUndefined()

      await createTestVerificationTemplate(userAuthToken!)

      const response = await request(app)
        .get('/verification-templates')
        .auth(userAuthToken!, { type: 'bearer' })
        .query({ limit: -1, offset: -1, text: generateRandomString(51) } as GetSchemasListRequest)
        .send()

      expect(response.status).toBe(400)
    })

    test('OKRequest.Filter.Empty.ReturnList"', async () => {
      const userAuthToken = await UserUtilities.register(app)
      expect(userAuthToken).not.toBeUndefined()

      const template1 = await createTestVerificationTemplate(userAuthToken!)
      const template2 = await createTestVerificationTemplate(userAuthToken!)
      const template3 = await createTestVerificationTemplate(userAuthToken!)

      const secondUserAuthToken = await UserUtilities.register(app)
      expect(secondUserAuthToken).not.toBeUndefined()

      await createTestVerificationTemplate(secondUserAuthToken!)
      await createTestVerificationTemplate(secondUserAuthToken!)

      const response = await request(app).get('/verification-templates').auth(userAuthToken!, { type: 'bearer' })

      expect(response.status).toBe(200)
      expect(response.body.total).toBe(3)
      expect(response.body.items[0].fields.length).toBe(template1?.fields?.length)
      expect(response.body.items[1].fields.length).toBe(template2?.fields?.length)
      expect(response.body.items[2].fields.length).toBe(template3?.fields?.length)
    })

    test('OKRequest.Filter.Pinned.ReturnList"', async () => {
      const userAuthToken = await UserUtilities.register(app)
      expect(userAuthToken).not.toBeUndefined()

      const schema = await SchemaUtilities.create(app, userAuthToken!)
      expect(schema).toBeDefined()

      const template1 = await createTestVerificationTemplate(userAuthToken!)
      await createTestVerificationTemplate(userAuthToken!)
      await createTestVerificationTemplate(userAuthToken!)

      const done = await VerificationTemplateUtilities.setPinned(app, userAuthToken!, template1!.id, true)
      expect(done).toBe(true)

      let response = await request(app)
        .get('/verification-templates')
        .auth(userAuthToken!, { type: 'bearer' })
        .query({ isPinned: true } as GetVerificationTemplatesListRequest)
        .send()

      expect(response.status).toBe(200)
      expect(response.body.total).toBe(1)

      response = await request(app)
        .get('/verification-templates')
        .auth(userAuthToken!, { type: 'bearer' })
        .query({ isPinned: false } as GetVerificationTemplatesListRequest)
        .send()

      expect(response.status).toBe(200)
      expect(response.body.total).toBe(2)
    })

    test('OKRequest.Filter.Text.ReturnList"', async () => {
      const userAuthToken = await UserUtilities.register(app)
      expect(userAuthToken).not.toBeUndefined()

      await createTestVerificationTemplate(userAuthToken!, {}, { name: 'Template AAAA' })
      await createTestVerificationTemplate(userAuthToken!, {}, { name: 'Template BBBB' })
      await createTestVerificationTemplate(userAuthToken!, {}, { name: 'Template CCAA' })

      let response = await request(app)
        .get('/verification-templates')
        .auth(userAuthToken!, { type: 'bearer' })
        .query({ text: 'AA' } as GetVerificationTemplatesListRequest)
        .send()

      expect(response.status).toBe(200)
      expect(response.body.total).toBe(2)

      response = await request(app)
        .get('/verification-templates')
        .auth(userAuthToken!, { type: 'bearer' })
        .query({ text: 'BBBB' } as GetVerificationTemplatesListRequest)
        .send()

      expect(response.status).toBe(200)
      expect(response.body.total).toBe(1)

      response = await request(app)
        .get('/verification-templates')
        .auth(userAuthToken!, { type: 'bearer' })
        .query({ text: 'CCCC' } as GetVerificationTemplatesListRequest)
        .send()

      expect(response.status).toBe(200)
      expect(response.body.total).toBe(0)
    })

    test('OKRequest.Paging.ReturnList"', async () => {
      const userAuthToken = await UserUtilities.register(app)
      expect(userAuthToken).not.toBeUndefined()

      const template1 = await createTestVerificationTemplate(userAuthToken!)
      const template2 = await createTestVerificationTemplate(userAuthToken!)
      const template3 = await createTestVerificationTemplate(userAuthToken!)
      const template4 = await createTestVerificationTemplate(userAuthToken!)
      const template5 = await createTestVerificationTemplate(userAuthToken!)

      let response = await request(app)
        .get('/verification-templates')
        .auth(userAuthToken!, { type: 'bearer' })
        .query({ offset: 0, limit: 2 } as GetVerificationTemplatesListRequest)
        .send()

      expect(response.status).toBe(200)
      expect(response.body.total).toBe(5)
      expect(response.body.items.length).toBe(2)
      expect(response.body.items[0].id).toBe(template1?.id)
      expect(response.body.items[1].id).toBe(template2?.id)

      response = await request(app)
        .get('/verification-templates')
        .auth(userAuthToken!, { type: 'bearer' })
        .query({ offset: 2, limit: 2 } as GetVerificationTemplatesListRequest)
        .send()

      expect(response.status).toBe(200)
      expect(response.body.total).toBe(5)
      expect(response.body.items.length).toBe(2)
      expect(response.body.items[0].id).toBe(template3?.id)
      expect(response.body.items[1].id).toBe(template4?.id)

      response = await request(app)
        .get('/verification-templates')
        .auth(userAuthToken!, { type: 'bearer' })
        .query({ offset: 4, limit: 2 } as GetVerificationTemplatesListRequest)
        .send()

      expect(response.status).toBe(200)
      expect(response.body.total).toBe(5)
      expect(response.body.items.length).toBe(1)
      expect(response.body.items[0].id).toBe(template5?.id)

      response = await request(app)
        .get('/verification-templates')
        .auth(userAuthToken!, { type: 'bearer' })
        .query({ offset: 6, limit: 2 } as GetVerificationTemplatesListRequest)
        .send()

      expect(response.status).toBe(200)
      expect(response.body.items.length).toBe(0)
      expect(response.body.total).toBe(5)
    })
  })

  describe('VerificationTemplate.GetById', () => {
    test('UnauthorizedRequest.ReturnUnauthorized', async () => {
      const uid = uuid()
      const response = await request(app).get(`/verification-templates/${uid}`)
      expect(response.status).toBe(401)
    })

    test('ForbiddenRequest.WrongUser.ReturnNotFound"', async () => {
      const firstUserAuthToken = await UserUtilities.register(app)
      expect(firstUserAuthToken).not.toBeUndefined()

      const template = await createTestVerificationTemplate(firstUserAuthToken!)

      const secondUserAuthToken = await UserUtilities.register(app)
      expect(secondUserAuthToken).not.toBeUndefined()

      const response = await request(app)
        .get(`/verification-templates/${template?.id}`)
        .auth(secondUserAuthToken!, { type: 'bearer' })

      expect(response.status).toBe(404)
    })

    test('BadRequest.ReturnNotFound', async () => {
      const userAuthToken = await UserUtilities.register(app)
      expect(userAuthToken).not.toBeUndefined()

      const response = await request(app)
        .get(`/verification-templates/${uuid()}`)
        .auth(userAuthToken!, { type: 'bearer' })
      expect(response.status).toBe(404)
    })

    test('OKRequest.ReturnTemplate"', async () => {
      const userAuthToken = await UserUtilities.register(app)
      expect(userAuthToken).toBeDefined()

      const template = await createTestVerificationTemplate(userAuthToken!)

      const response = await request(app)
        .get(`/verification-templates/${template?.id}`)
        .auth(userAuthToken!, { type: 'bearer' })

      expect(response.status).toBe(200)
      expect(response.body.id).toBe(template?.id)
      expect(response.body.name).toBe(template?.name)
      expect(response.body.protocol).toBe(template?.protocol)
      expect(response.body.credentialFormat).toBe(template?.credentialFormat)
      expect(response.body.network).toBe(template?.network)
      expect(response.body.did).toBe(template?.did)
      expect(response.body.schema.id).toBe(template?.schema.id)
      expect(response.body.fields?.length).toBe(template?.fields?.length)
    })
  })

  describe('VerificationTemplate.Create', () => {
    test('UnauthorizedRequest.ReturnUnauthorized', async () => {
      const response = await request(app).post('/verification-templates')
      expect(response.status).toBe(401)
    })

    describe('BadRequest.Name', () => {
      test('Empty.ReturnBadRequest', async () => {
        const userAuthToken = await UserUtilities.register(app)
        expect(userAuthToken).not.toBeUndefined()

        const response = await request(app)
          .post('/verification-templates')
          .auth(userAuthToken!, { type: 'bearer' })
          .send({ name: '' } as CreateVerificationTemplateRequest)

        expect(response.status).toBe(400)
        expect(response.body.message).toContain('name must be longer than or equal to 1 characters')
      })

      test('Long.ReturnBadRequest', async () => {
        const userAuthToken = await UserUtilities.register(app)
        expect(userAuthToken).not.toBeUndefined()

        const response = await request(app)
          .post('/verification-templates')
          .auth(userAuthToken!, { type: 'bearer' })
          .send({ name: generateRandomString(501) } as CreateVerificationTemplateRequest)

        expect(response.status).toBe(400)
        expect(response.body.message).toContain('name must be shorter than or equal to 500 characters')
      })

      test('NotUnique.ReturnBadRequest', async () => {
        const userAuthToken = await UserUtilities.register(app)
        expect(userAuthToken).not.toBeUndefined()

        const templateName = generateRandomString(30, true, true, false)

        const template = await createTestVerificationTemplate(userAuthToken!, {}, { name: templateName })

        const response = await request(app)
          .post('/verification-templates')
          .auth(userAuthToken!, { type: 'bearer' })
          .send({
            name: templateName,
            protocol: ProtocolType.Oid4vc,
            credentialFormat: OpenId4VcCredentialFormat.SdJwtVc,
            network: DidMethod.Key,
            did: uuid(),
            schemaId: template?.schema.id,
            fields: [{ schemaFieldId: template?.fields[0].schemaFieldId }],
          } as CreateVerificationTemplateRequest)

        expect(response.status).toBe(400)
        expect(response.body.message).toContain(`Template with name ${templateName} already exists.`)
      })
    })

    describe('BadRequest.Protocol', () => {
      test('WrongProtocol.ReturnBadRequest', async () => {
        const userAuthToken = await UserUtilities.register(app)
        expect(userAuthToken).not.toBeUndefined()

        const response = await request(app)
          .post('/verification-templates')
          .auth(userAuthToken!, { type: 'bearer' })
          .send({
            name: uuid(),
            protocol: uuid(),
          } as CreateVerificationTemplateRequest)

        expect(response.status).toBe(400)
        expect(response.body.message).toContain('protocol must be one of the following values: Aries, OpenId4VC')
      })
    })

    describe('BadRequest.CredentialFormats', () => {
      test('ProtocolsIncompatible.ReturnBadRequest', async () => {
        const userAuthToken = await UserUtilities.register(app)
        expect(userAuthToken).not.toBeUndefined()

        let response = await request(app)
          .post('/verification-templates')
          .auth(userAuthToken!, { type: 'bearer' })
          .send({
            name: uuid(),
            protocol: ProtocolType.Aries,
            credentialFormat: OpenId4VcCredentialFormat.JwtVcJsonLd,
          } as CreateVerificationTemplateRequest)

        expect(response.status).toBe(400)
        expect(response.body.message).toContain('CredentialFormat is not compatible with the protocol')

        response = await request(app)
          .post('/verification-templates')
          .auth(userAuthToken!, { type: 'bearer' })
          .send({
            name: uuid(),
            protocol: ProtocolType.Aries,
            credentialFormat: OpenId4VcCredentialFormat.SdJwtVc,
          } as CreateVerificationTemplateRequest)

        expect(response.status).toBe(400)
        expect(response.body.message).toContain('CredentialFormat is not compatible with the protocol')

        response = await request(app)
          .post('/verification-templates')
          .auth(userAuthToken!, { type: 'bearer' })
          .send({
            name: uuid(),
            protocol: ProtocolType.Aries,
            credentialFormat: OpenId4VcCredentialFormat.JwtVcJson,
          } as CreateVerificationTemplateRequest)

        expect(response.status).toBe(400)
        expect(response.body.message).toContain('CredentialFormat is not compatible with the protocol')

        response = await request(app)
          .post('/verification-templates')
          .auth(userAuthToken!, { type: 'bearer' })
          .send({
            name: uuid(),
            protocol: ProtocolType.Aries,
            credentialFormat: OpenId4VcCredentialFormat.LdpVc,
          } as CreateVerificationTemplateRequest)

        expect(response.status).toBe(400)
        expect(response.body.message).toContain('CredentialFormat is not compatible with the protocol')

        response = await request(app)
          .post('/verification-templates')
          .auth(userAuthToken!, { type: 'bearer' })
          .send({
            name: uuid(),
            protocol: ProtocolType.Oid4vc,
            credentialFormat: AriesCredentialFormat.AnoncredsIndy,
          } as CreateVerificationTemplateRequest)

        expect(response.status).toBe(400)
        expect(response.body.message).toContain('CredentialFormat is not compatible with the protocol')

        response = await request(app)
          .post('/verification-templates')
          .auth(userAuthToken!, { type: 'bearer' })
          .send({
            name: uuid(),
            protocol: ProtocolType.Oid4vc,
            credentialFormat: AriesCredentialFormat.AnoncredsW3c,
          } as CreateVerificationTemplateRequest)

        expect(response.status).toBe(400)
        expect(response.body.message).toContain('CredentialFormat is not compatible with the protocol')
      })
    })

    describe('BadRequest.Network', () => {
      test('ProtocolsIncompatible.ReturnBadRequest', async () => {
        const userAuthToken = await UserUtilities.register(app)
        expect(userAuthToken).not.toBeUndefined()

        let response = await request(app)
          .post('/verification-templates')
          .auth(userAuthToken!, { type: 'bearer' })
          .send({
            name: uuid(),
            protocol: ProtocolType.Aries,
            network: DidMethod.Key,
          } as CreateVerificationTemplateRequest)

        expect(response.status).toBe(400)
        expect(response.body.message).toContain('DidMethod is not compatible with the protocol')

        response = await request(app)
          .post('/verification-templates')
          .auth(userAuthToken!, { type: 'bearer' })
          .send({
            name: uuid(),
            protocol: ProtocolType.Oid4vc,
            network: DidMethod.Indy,
          } as CreateVerificationTemplateRequest)

        expect(response.status).toBe(400)
        expect(response.body.message).toContain('DidMethod is not compatible with the protocol')
      })

      test('Aries.NetworkSkipped.ReturnBadRequest', async () => {
        const userAuthToken = await UserUtilities.register(app)
        expect(userAuthToken).not.toBeUndefined()

        const schema = await createTestSchema(userAuthToken!)

        const templateName = uuid()

        const response = await request(app)
          .post('/verification-templates')
          .auth(userAuthToken!, { type: 'bearer' })
          .send({
            name: templateName,
            protocol: ProtocolType.Aries,
            credentialFormat: AriesCredentialFormat.AnoncredsIndy,
            schemaId: schema?.id,
            fields: [{ schemaFieldId: schema?.fields[0].id }],
          } as CreateVerificationTemplateRequest)

        expect(response.status).toBe(400)
        expect(response.body.message).toContain(`Network should be defined for the ${ProtocolType.Aries} protocol.`)
      })
    })

    describe('BadRequest.Did', () => {
      test('LongDid.ReturnBadRequest', async () => {
        const userAuthToken = await UserUtilities.register(app)
        expect(userAuthToken).not.toBeUndefined()

        const response = await request(app)
          .post('/verification-templates')
          .auth(userAuthToken!, { type: 'bearer' })
          .send({
            name: uuid(),
            did: generateRandomString(1001),
          } as CreateVerificationTemplateRequest)

        expect(response.status).toBe(400)
        expect(response.body.message).toContain('did must be shorter than or equal to 1000 characters')
      })
    })

    describe('BadRequest.Schema', () => {
      test('NotExist.ReturnNotFound', async () => {
        const userAuthToken = await UserUtilities.register(app)
        expect(userAuthToken).not.toBeUndefined()

        const templateName = uuid()
        const response = await request(app)
          .post('/verification-templates')
          .auth(userAuthToken!, { type: 'bearer' })
          .send({
            name: templateName,
            protocol: ProtocolType.Oid4vc,
            credentialFormat: OpenId4VcCredentialFormat.SdJwtVc,
            network: DidMethod.Key,
            did: uuid(),
            fields: [{ schemaFieldId: uuid() }],
            schemaId: uuid(),
          } as CreateVerificationTemplateRequest)

        expect(response.status).toBe(404)
      })

      test('NotOwn.ReturnNotFound', async () => {
        const userAuthToken = await UserUtilities.register(app)
        expect(userAuthToken).not.toBeUndefined()

        const schema = await SchemaUtilities.create(app, userAuthToken!)
        expect(schema).toBeDefined()

        const anotherUserAuthToken = await UserUtilities.register(app)
        expect(anotherUserAuthToken).toBeDefined()

        const response = await request(app)
          .post('/verification-templates')
          .auth(anotherUserAuthToken!, { type: 'bearer' })
          .send({
            name: uuid(),
            protocol: ProtocolType.Oid4vc,
            credentialFormat: OpenId4VcCredentialFormat.SdJwtVc,
            network: DidMethod.Key,
            did: uuid(),
            fields: [{ schemaFieldId: uuid() }],
            schemaId: schema?.id,
          } as CreateVerificationTemplateRequest)

        expect(response.status).toBe(404)
        expect(response.body.message).toContain(`Schema ${schema?.id} not exists.`)
      })
    })

    describe('BadRequest.Fields', () => {
      test('NotUnique.ReturnBadRequest', async () => {
        const userAuthToken = await UserUtilities.register(app)
        expect(userAuthToken).not.toBeUndefined()

        const schema = await createTestSchema(userAuthToken!)
        const schemaFieldId = schema?.fields[0].id

        const response = await request(app)
          .post('/verification-templates')
          .auth(userAuthToken!, { type: 'bearer' })
          .send({
            name: uuid(),
            protocol: ProtocolType.Oid4vc,
            credentialFormat: OpenId4VcCredentialFormat.SdJwtVc,
            network: DidMethod.Key,
            did: uuid(),
            schemaId: schema?.id,
            fields: [{ schemaFieldId }, { schemaFieldId }],
          } as CreateVerificationTemplateRequest)

        expect(response.status).toBe(400)
        expect(response.body.message).toContain("All fields's elements must be unique")
      })

      test('NotExistsInSchema.ReturnBadRequest', async () => {
        const userAuthToken = await UserUtilities.register(app)
        expect(userAuthToken).not.toBeUndefined()

        const schema = await createTestSchema(userAuthToken!)
        const schemaFieldId = uuid()

        const response = await request(app)
          .post('/verification-templates')
          .auth(userAuthToken!, { type: 'bearer' })
          .send({
            name: uuid(),
            protocol: ProtocolType.Oid4vc,
            credentialFormat: OpenId4VcCredentialFormat.SdJwtVc,
            network: DidMethod.Key,
            did: uuid(),
            schemaId: schema?.id,
            fields: [{ schemaFieldId }],
          } as CreateVerificationTemplateRequest)

        expect(response.status).toBe(400)
        expect(response.body.message).toContain(`Some requests fields ids weren't present in the template schema`)
      })

      test('NotFullSet.ReturnBadRequest', async () => {
        const userAuthToken = await UserUtilities.register(app)
        expect(userAuthToken).not.toBeUndefined()

        const schema = await createTestSchema(userAuthToken!)

        let response = await request(app)
          .post('/verification-templates')
          .auth(userAuthToken!, { type: 'bearer' })
          .send({
            name: uuid(),
            protocol: ProtocolType.Oid4vc,
            credentialFormat: OpenId4VcCredentialFormat.JwtVcJson,
            network: DidMethod.Key,
            did: uuid(),
            schemaId: schema?.id,
            fields: [{ schemaFieldId: schema?.fields[0].id }, { schemaFieldId: schema?.fields[1].id }],
          } as CreateVerificationTemplateRequest)

        expect(response.status).toBe(400)
        expect(response.body.message).toContain(
          `For this protocol and credential format need to send all schema fields ids`,
        )

        response = await request(app)
          .post('/verification-templates')
          .auth(userAuthToken!, { type: 'bearer' })
          .send({
            name: uuid(),
            protocol: ProtocolType.Oid4vc,
            credentialFormat: OpenId4VcCredentialFormat.JwtVcJsonLd,
            network: DidMethod.Key,
            did: uuid(),
            schemaId: schema?.id,
            fields: [{ schemaFieldId: schema?.fields[0].id }, { schemaFieldId: schema?.fields[1].id }],
          } as CreateVerificationTemplateRequest)

        expect(response.status).toBe(400)
        expect(response.body.message).toContain(
          `For this protocol and credential format need to send all schema fields ids`,
        )

        response = await request(app)
          .post('/verification-templates')
          .auth(userAuthToken!, { type: 'bearer' })
          .send({
            name: uuid(),
            protocol: ProtocolType.Oid4vc,
            credentialFormat: OpenId4VcCredentialFormat.LdpVc,
            network: DidMethod.Key,
            did: uuid(),
            schemaId: schema?.id,
            fields: [{ schemaFieldId: schema?.fields[0].id }, { schemaFieldId: schema?.fields[1].id }],
          } as CreateVerificationTemplateRequest)

        expect(response.status).toBe(400)
        expect(response.body.message).toContain(
          `For this protocol and credential format need to send all schema fields ids`,
        )
      })
    })

    test('OKRequest.Aries.Created.ReturnTemplateDetails"', async () => {
      const userAuthToken = await UserUtilities.register(app)
      expect(userAuthToken).not.toBeUndefined()

      const schema = await createTestSchema(userAuthToken!)

      const templateName = uuid()
      const templateDid = uuid()

      const response = await request(app)
        .post('/verification-templates')
        .auth(userAuthToken!, { type: 'bearer' })
        .send({
          name: templateName,
          protocol: ProtocolType.Aries,
          credentialFormat: AriesCredentialFormat.AnoncredsIndy,
          network: DidMethod.Indy,
          did: templateDid,
          schemaId: schema?.id,
          fields: [{ schemaFieldId: schema?.fields[0].id }],
        } as CreateVerificationTemplateRequest)

      expect(response.status).toBe(201)
      expect(response.body.id).toBeDefined()
      expect(response.body.name).toBe(templateName)
      expect(response.body.protocol).toBe(ProtocolType.Aries)
      expect(response.body.credentialFormat).toBe(AriesCredentialFormat.AnoncredsIndy)
      expect(response.body.network).toBe(DidMethod.Indy)
      expect(response.body.did).toBe(templateDid)
      expect(response.body.schema.id).toBe(schema?.id)
      expect(response.body.fields[0]?.schemaFieldId).toBe(schema?.fields[0]?.id)
      expect(response.body.fields[0]?.schemaFieldName).toBe(schema?.fields[0]?.name)
    })

    test('OKRequest.Oid4vc.Created.ReturnTemplateDetails"', async () => {
      const userAuthToken = await UserUtilities.register(app)
      expect(userAuthToken).not.toBeUndefined()

      const schema = await createTestSchema(userAuthToken!)

      const templateName = uuid()

      const response = await request(app)
        .post('/verification-templates')
        .auth(userAuthToken!, { type: 'bearer' })
        .send({
          name: templateName,
          protocol: ProtocolType.Oid4vc,
          credentialFormat: OpenId4VcCredentialFormat.SdJwtVc,
          schemaId: schema?.id,
          fields: [{ schemaFieldId: schema?.fields[0].id }],
        } as CreateVerificationTemplateRequest)

      expect(response.status).toBe(201)
      expect(response.body.id).toBeDefined()
      expect(response.body.name).toBe(templateName)
      expect(response.body.protocol).toBe(ProtocolType.Oid4vc)
      expect(response.body.credentialFormat).toBe(OpenId4VcCredentialFormat.SdJwtVc)
      expect(response.body.network).toBeUndefined()
      expect(response.body.did).toBeUndefined()
      expect(response.body.schema.id).toBe(schema?.id)
      expect(response.body.fields[0]?.schemaFieldId).toBe(schema?.fields[0]?.id)
      expect(response.body.fields[0]?.schemaFieldName).toBe(schema?.fields[0]?.name)
    })
  })

  describe('VerificationTemplate.Patch', () => {
    test('UnauthorizedRequest.ReturnUnauthorized', async () => {
      const uid = uuid()
      const response = await request(app).patch(`/verification-templates/${uid}`)
      expect(response.status).toBe(401)
    })

    test('ForbiddenRequest.WrongUser.ReturnNotFound"', async () => {
      const firstUserAuthToken = await UserUtilities.register(app)
      expect(firstUserAuthToken).toBeDefined()

      const template = await createTestVerificationTemplate(firstUserAuthToken!)

      const secondUserAuthToken = await UserUtilities.register(app)
      expect(secondUserAuthToken).not.toBeUndefined()

      const response = await request(app)
        .patch(`/verification-templates/${template?.id}`)
        .auth(secondUserAuthToken!, { type: 'bearer' })

      expect(response.status).toBe(404)
    })

    test('BadRequest.NotExistTemplateId.ReturnNotFound"', async () => {
      const userAuthToken = await UserUtilities.register(app)
      expect(userAuthToken).toBeDefined()

      const response = await request(app)
        .patch(`/verification-templates/${uuid()}`)
        .auth(userAuthToken!, { type: 'bearer' })

      expect(response.status).toBe(404)
    })

    test('BadRequest.Pinned.ReturnBadRequest', async () => {
      const userAuthToken = await UserUtilities.register(app)
      expect(userAuthToken).not.toBeUndefined()

      const template = await createTestVerificationTemplate(userAuthToken!)

      const response = await request(app)
        .patch(`/verification-templates/${template?.id}`)
        .auth(userAuthToken!, { type: 'bearer' })
        .send({ isPinned: uuid() })

      expect(response.status).toBe(400)
      expect(response.body.message).toContain('isPinned must be a boolean value')
    })

    test('OKRequest.Pinned.Changed.ReturnOK', async () => {
      const userAuthToken = await UserUtilities.register(app)
      expect(userAuthToken).not.toBeUndefined()

      const template = await createTestVerificationTemplate(userAuthToken!)

      let response = await request(app)
        .patch(`/verification-templates/${template?.id}`)
        .auth(userAuthToken!, { type: 'bearer' })
        .send({ isPinned: true })

      expect(response.status).toBe(200)

      let patched = await VerificationTemplateUtilities.get(app, userAuthToken!, template!.id)
      expect(patched.isPinned).toBe(true)

      response = await request(app)
        .patch(`/verification-templates/${template?.id}`)
        .auth(userAuthToken!, { type: 'bearer' })
        .send({ isPinned: false })

      expect(response.status).toBe(200)

      patched = await VerificationTemplateUtilities.get(app, userAuthToken!, template!.id)
      expect(patched.isPinned).toBe(false)
    })

    describe('BadRequest.Position', () => {
      test('WrongPreviousTemplate.ReturnBadRequest', async () => {
        const userAuthToken = await UserUtilities.register(app)
        expect(userAuthToken).not.toBeUndefined()

        const template = await createTestVerificationTemplate(userAuthToken!)

        const previousTemplateId = uuid()
        const response = await request(app)
          .patch(`/verification-templates/${template?.id}`)
          .auth(userAuthToken!, { type: 'bearer' })
          .send({ previousTemplateId })

        expect(response.status).toBe(400)
        expect(response.body.message).toContain(
          `Previous verification template with id ${previousTemplateId} not found.`,
        )
      })

      test('NotOwnPreviousTemplate.ReturnBadRequest', async () => {
        const firstUserAuthToken = await UserUtilities.register(app)
        expect(firstUserAuthToken).not.toBeUndefined()

        const template1 = await createTestVerificationTemplate(firstUserAuthToken!)

        const secondUserAuthToken = await UserUtilities.register(app)
        expect(secondUserAuthToken).not.toBeUndefined()

        const template2 = await createTestVerificationTemplate(secondUserAuthToken!)

        const previousTemplateId = template2?.id
        const response = await request(app)
          .patch(`/verification-templates/${template1?.id}`)
          .auth(firstUserAuthToken!, { type: 'bearer' })
          .send({ previousTemplateId: template2?.id })

        expect(response.status).toBe(400)
        expect(response.body.message).toContain(
          `Previous verification template with id ${previousTemplateId} not found.`,
        )
      })
    })

    describe('OKRequest.Position', () => {
      test('ToFirst.Moved.ReturnOK', async () => {
        const userAuthToken = await UserUtilities.register(app)
        expect(userAuthToken).toBeDefined()

        const template1 = await createTestVerificationTemplate(userAuthToken!)
        const template2 = await createTestVerificationTemplate(userAuthToken!)
        const template3 = await createTestVerificationTemplate(userAuthToken!)
        const template4 = await createTestVerificationTemplate(userAuthToken!)

        const response = await request(app)
          .patch(`/verification-templates/${template3?.id}`)
          .auth(userAuthToken!, { type: 'bearer' })
          .send({ previousTemplateId: '' } as PatchVerificationTemplateRequest)

        expect(response.status).toBe(200)

        const templates = await VerificationTemplateUtilities.getList(app, userAuthToken!)

        expect(templates.items.length).toBe(4)

        expect(templates.items[0].id).toBe(template3?.id)
        expect(templates.items[0].orderIndex).toBe(0)

        expect(templates.items[1].id).toBe(template1?.id)
        expect(templates.items[1].orderIndex).toBe(1)

        expect(templates.items[2].id).toBe(template2?.id)
        expect(templates.items[2].orderIndex).toBe(2)

        expect(templates.items[3].id).toBe(template4?.id)
        expect(templates.items[3].orderIndex).toBe(3)
      })

      test('AfterTemplate.Moved.ReturnOK', async () => {
        const userAuthToken = await UserUtilities.register(app)
        expect(userAuthToken).toBeDefined()

        const template1 = await createTestVerificationTemplate(userAuthToken!)
        const template2 = await createTestVerificationTemplate(userAuthToken!)
        const template3 = await createTestVerificationTemplate(userAuthToken!)
        const template4 = await createTestVerificationTemplate(userAuthToken!)

        const response = await request(app)
          .patch(`/verification-templates/${template3?.id}`)
          .auth(userAuthToken!, { type: 'bearer' })
          .send({ previousTemplateId: template1?.id } as PatchVerificationTemplateRequest)

        expect(response.status).toBe(200)

        const templates = await VerificationTemplateUtilities.getList(app, userAuthToken!)

        expect(templates.items.length).toBe(4)

        expect(templates.items[0].id).toBe(template1?.id)
        expect(templates.items[0].orderIndex).toBe(0)

        expect(templates.items[1].id).toBe(template3?.id)
        expect(templates.items[1].orderIndex).toBe(1)

        expect(templates.items[2].id).toBe(template2?.id)
        expect(templates.items[2].orderIndex).toBe(2)

        expect(templates.items[3].id).toBe(template4?.id)
        expect(templates.items[3].orderIndex).toBe(3)
      })

      test('Pin.Move.UnPin.Move.Moved.ReturnOK', async () => {
        // first step: create 7 templates ()
        // second step: pin 3 last templates (5,6,7)
        // thirds step: move 3 template after 1. Should be gotten 4 unpinned templates (1,3,2,4)
        // fourth step: move 6 template after 7. Should be gotten 3 pinned templates (5,7,6)
        // five step: unpin 7 template and move it after 3. Should be gotten 5 unpinned templates (1,3,7,2,4)
        // six step: pin 1 template and move it after 5. Should be gotten 3 pinned templates (5,1,6)

        const userAuthToken = await UserUtilities.register(app)
        expect(userAuthToken).toBeDefined()

        // step 1
        const template1 = await createTestVerificationTemplate(userAuthToken!, {}, { name: 'template 1' })
        const template2 = await createTestVerificationTemplate(userAuthToken!, {}, { name: 'template 2' })
        const template3 = await createTestVerificationTemplate(userAuthToken!, {}, { name: 'template 3' })
        const template4 = await createTestVerificationTemplate(userAuthToken!, {}, { name: 'template 4' })
        const template5 = await createTestVerificationTemplate(userAuthToken!, {}, { name: 'template 5' })
        const template6 = await createTestVerificationTemplate(userAuthToken!, {}, { name: 'template 6' })
        const template7 = await createTestVerificationTemplate(userAuthToken!, {}, { name: 'template 7' })

        // step 2
        let done = await VerificationTemplateUtilities.setPinned(app, userAuthToken!, template5!.id, true)
        expect(done).toBe(true)
        done = await VerificationTemplateUtilities.setPinned(app, userAuthToken!, template6!.id, true)
        expect(done).toBe(true)
        done = await VerificationTemplateUtilities.setPinned(app, userAuthToken!, template7!.id, true)
        expect(done).toBe(true)

        // step 3
        let response = await request(app)
          .patch(`/verification-templates/${template3?.id}`)
          .auth(userAuthToken!, { type: 'bearer' })
          .send({ previousTemplateId: template1?.id } as PatchVerificationTemplateRequest)

        expect(response.status).toBe(200)

        let list = await VerificationTemplateUtilities.getList(app, userAuthToken!, { isPinned: false })

        expect(list.items.length).toBe(4)

        expect(list.items[0].id).toBe(template1?.id)
        expect(list.items[0].orderIndex).toBe(0)

        expect(list.items[1].id).toBe(template3?.id)
        expect(list.items[1].orderIndex).toBe(1)

        expect(list.items[2].id).toBe(template2?.id)
        expect(list.items[2].orderIndex).toBe(2)

        expect(list.items[3].id).toBe(template4?.id)
        expect(list.items[3].orderIndex).toBe(3)

        // step 4
        response = await request(app)
          .patch(`/verification-templates/${template6?.id}`)
          .auth(userAuthToken!, { type: 'bearer' })
          .send({ previousTemplateId: template7?.id } as PatchVerificationTemplateRequest)

        expect(response.status).toBe(200)

        list = await VerificationTemplateUtilities.getList(app, userAuthToken!, { isPinned: true })

        expect(list.items.length).toBe(3)

        expect(list.items[0].id).toBe(template5?.id)
        expect(list.items[0].orderIndex).toBe(0)

        expect(list.items[1].id).toBe(template7?.id)
        expect(list.items[1].orderIndex).toBe(1)

        expect(list.items[2].id).toBe(template6?.id)
        expect(list.items[2].orderIndex).toBe(2)

        // step 5
        done = await VerificationTemplateUtilities.setPinned(app, userAuthToken!, template7!.id, false)
        expect(done).toBe(true)

        response = await request(app)
          .patch(`/verification-templates/${template7?.id}`)
          .auth(userAuthToken!, { type: 'bearer' })
          .send({ previousTemplateId: template3?.id } as PatchVerificationTemplateRequest)

        expect(response.status).toBe(200)

        list = await VerificationTemplateUtilities.getList(app, userAuthToken!, { isPinned: false })

        expect(list.items.length).toBe(5)

        expect(list.items[0].id).toBe(template1?.id)
        expect(list.items[0].orderIndex).toBe(0)

        expect(list.items[1].id).toBe(template3?.id)
        expect(list.items[1].orderIndex).toBe(1)

        expect(list.items[2].id).toBe(template7?.id)
        expect(list.items[2].orderIndex).toBe(2)

        expect(list.items[3].id).toBe(template2?.id)
        expect(list.items[3].orderIndex).toBe(3)

        expect(list.items[4].id).toBe(template4?.id)
        expect(list.items[4].orderIndex).toBe(4)

        // step 6
        done = await VerificationTemplateUtilities.setPinned(app, userAuthToken!, template1!.id, true)
        expect(done).toBe(true)

        response = await request(app)
          .patch(`/verification-templates/${template1?.id}`)
          .auth(userAuthToken!, { type: 'bearer' })
          .send({ previousTemplateId: template5?.id } as PatchVerificationTemplateRequest)

        expect(response.status).toBe(200)

        list = await VerificationTemplateUtilities.getList(app, userAuthToken!, { isPinned: true })

        expect(list.items.length).toBe(3)

        expect(list.items[0].id).toBe(template5?.id)
        expect(list.items[0].orderIndex).toBe(0)

        expect(list.items[1].id).toBe(template1?.id)
        expect(list.items[1].orderIndex).toBe(1)

        expect(list.items[2].id).toBe(template6?.id)
        expect(list.items[2].orderIndex).toBe(2)
      })
    })

    describe('BadRequest.Name', () => {
      test('Empty.ReturnBadRequest', async () => {
        const userAuthToken = await UserUtilities.register(app)
        expect(userAuthToken).not.toBeUndefined()

        const template = await createTestVerificationTemplate(userAuthToken!, {}, { name: 'template 1' })

        const response = await request(app)
          .patch(`/verification-templates/${template?.id}`)
          .auth(userAuthToken!, { type: 'bearer' })
          .send({ name: '' } as CreateVerificationTemplateRequest)

        expect(response.status).toBe(400)
        expect(response.body.message).toContain('name must be longer than or equal to 1 characters')
      })

      test('Long.ReturnBadRequest', async () => {
        const userAuthToken = await UserUtilities.register(app)
        expect(userAuthToken).not.toBeUndefined()

        const template = await createTestVerificationTemplate(userAuthToken!, {}, { name: 'template 1' })

        const response = await request(app)
          .patch(`/verification-templates/${template?.id}`)
          .auth(userAuthToken!, { type: 'bearer' })
          .send({ name: generateRandomString(501) } as CreateVerificationTemplateRequest)

        expect(response.status).toBe(400)
        expect(response.body.message).toContain('name must be shorter than or equal to 500 characters')
      })

      test('NotUnique.ReturnBadRequest', async () => {
        const userAuthToken = await UserUtilities.register(app)
        expect(userAuthToken).not.toBeUndefined()

        const templateName = generateRandomString(30, true, true, false)
        await createTestVerificationTemplate(userAuthToken!, {}, { name: templateName })

        const template2 = await createTestVerificationTemplate(userAuthToken!)

        const response = await request(app)
          .patch(`/verification-templates/${template2?.id}`)
          .auth(userAuthToken!, { type: 'bearer' })
          .send({ name: templateName } as CreateVerificationTemplateRequest)

        expect(response.status).toBe(400)
        expect(response.body.message).toContain(`Template with name ${templateName} already exists.`)
      })
    })

    describe('BadRequest.Fields', () => {
      test('NotUnique.ReturnBadRequest', async () => {
        const userAuthToken = await UserUtilities.register(app)
        expect(userAuthToken).not.toBeUndefined()

        const schema = await createTestSchema(userAuthToken!)
        const template = await createTestVerificationTemplate(userAuthToken!, {}, { schemaId: schema?.id })

        const schemaFieldId = schema?.fields[0].id

        const response = await request(app)
          .patch(`/verification-templates/${template?.id}`)
          .auth(userAuthToken!, { type: 'bearer' })
          .send({
            fields: [{ schemaFieldId }, { schemaFieldId }],
          } as CreateVerificationTemplateRequest)

        expect(response.status).toBe(400)
        expect(response.body.message).toContain("All fields's elements must be unique")
      })

      test('NotExistsInSchema.ReturnBadRequest', async () => {
        const userAuthToken = await UserUtilities.register(app)
        expect(userAuthToken).not.toBeUndefined()

        const schema = await createTestSchema(userAuthToken!)
        const template = await createTestVerificationTemplate(userAuthToken!, {}, { schemaId: schema?.id })

        const schemaFieldId = uuid()

        const response = await request(app)
          .patch(`/verification-templates/${template?.id}`)
          .auth(userAuthToken!, { type: 'bearer' })
          .send({
            fields: [{ schemaFieldId }],
          } as PatchVerificationTemplateRequest)

        expect(response.status).toBe(400)
        expect(response.body.message).toContain(`Some requests fields ids weren't present in the template schema`)
      })

      test('NotFullSet.ReturnBadRequest', async () => {
        const userAuthToken = await UserUtilities.register(app)
        expect(userAuthToken).not.toBeUndefined()

        const schema = await createTestSchema(userAuthToken!)
        const template = await createTestVerificationTemplate(
          userAuthToken!,
          {},
          {
            protocol: ProtocolType.Oid4vc,
            credentialFormat: OpenId4VcCredentialFormat.JwtVcJson,
            network: DidMethod.Key,
            did: uuid(),
            schemaId: schema?.id,
          },
        )

        let response = await request(app)
          .patch(`/verification-templates/${template?.id}`)
          .auth(userAuthToken!, { type: 'bearer' })
          .send({
            fields: [{ schemaFieldId: schema?.fields[0].id }, { schemaFieldId: schema?.fields[1].id }],
          } as CreateVerificationTemplateRequest)

        expect(response.status).toBe(400)
        expect(response.body.message).toContain(
          `For this protocol and credential format need to send all schema fields ids`,
        )

        response = await request(app)
          .post('/verification-templates')
          .auth(userAuthToken!, { type: 'bearer' })
          .send({
            name: uuid(),
            protocol: ProtocolType.Oid4vc,
            credentialFormat: OpenId4VcCredentialFormat.JwtVcJsonLd,
            network: DidMethod.Key,
            did: uuid(),
            schemaId: schema?.id,
            fields: [{ schemaFieldId: schema?.fields[0].id }, { schemaFieldId: schema?.fields[1].id }],
          } as CreateVerificationTemplateRequest)

        expect(response.status).toBe(400)
        expect(response.body.message).toContain(
          `For this protocol and credential format need to send all schema fields ids`,
        )

        response = await request(app)
          .post('/verification-templates')
          .auth(userAuthToken!, { type: 'bearer' })
          .send({
            name: uuid(),
            protocol: ProtocolType.Oid4vc,
            credentialFormat: OpenId4VcCredentialFormat.LdpVc,
            network: DidMethod.Key,
            did: uuid(),
            schemaId: schema?.id,
            fields: [{ schemaFieldId: schema?.fields[0].id }, { schemaFieldId: schema?.fields[1].id }],
          } as CreateVerificationTemplateRequest)

        expect(response.status).toBe(400)
        expect(response.body.message).toContain(
          `For this protocol and credential format need to send all schema fields ids`,
        )
      })
    })

    test('OKRequest.Complete.Patched"', async () => {
      const userAuthToken = await UserUtilities.register(app)
      expect(userAuthToken).not.toBeUndefined()

      const schema = await createTestSchema(userAuthToken!)
      const template = await createTestVerificationTemplate(userAuthToken!, {}, { schemaId: schema?.id })

      const name = uuid()
      const fields = [{ schemaFieldId: schema!.fields[1].id } as PatchVerificationTemplateFieldRequest]

      const response = await request(app)
        .patch(`/verification-templates/${template?.id}`)
        .auth(userAuthToken!, { type: 'bearer' })
        .send({ name, fields } as PatchVerificationTemplateRequest)

      expect(response.status).toBe(200)

      const patchedTemplate = await VerificationTemplateUtilities.get(app, userAuthToken!, template!.id)

      expect(patchedTemplate.id).toBe(template?.id)
      expect(patchedTemplate.protocol).toBe(template?.protocol)
      expect(patchedTemplate.credentialFormat).toBe(template?.credentialFormat)
      expect(patchedTemplate.network).toBeNull()
      expect(patchedTemplate.did).toBeNull()
      expect(patchedTemplate.schema.id).toBe(template?.schema.id)
      expect(patchedTemplate.fields?.length).toBe(1)
      expect(patchedTemplate.fields[0].schemaFieldId).toBe(schema?.fields[1].id)
      expect(patchedTemplate.fields[0].schemaFieldName).toBe(schema?.fields[1].name)
    })
  })

  describe('VerificationTemplate.Delete', () => {
    test('UnauthorizedRequest.ReturnUnauthorized', async () => {
      const response = await request(app).delete(`/verification-templates/${uuid()}`)
      expect(response.status).toBe(401)
    })

    test('ForbiddenRequest.WrongUser.ReturnNotFound"', async () => {
      const firstUserAuthToken = await UserUtilities.register(app)
      expect(firstUserAuthToken).not.toBeUndefined()

      const template = await createTestVerificationTemplate(firstUserAuthToken!)

      const secondUserAuthToken = await UserUtilities.register(app)
      expect(secondUserAuthToken).not.toBeUndefined()

      const response = await request(app)
        .delete(`/verification-templates/${template?.id}`)
        .auth(secondUserAuthToken!, { type: 'bearer' })

      expect(response.status).toBe(404)
    })

    test('NotExist.ReturnNotFound', async () => {
      const userAuthToken = await UserUtilities.register(app)
      expect(userAuthToken).not.toBeUndefined()

      const response = await request(app)
        .delete(`/verification-templates/${uuid()}`)
        .auth(userAuthToken!, { type: 'bearer' })
      expect(response.status).toBe(404)
    })

    test('OKRequest.DeleteTemplate"', async () => {
      const userAuthToken = await UserUtilities.register(app)
      expect(userAuthToken).toBeDefined()

      const template = await createTestVerificationTemplate(userAuthToken!)

      const response = await request(app)
        .delete(`/verification-templates/${template?.id}`)
        .auth(userAuthToken!, { type: 'bearer' })

      expect(response.status).toBe(200)
    })
  })
})
