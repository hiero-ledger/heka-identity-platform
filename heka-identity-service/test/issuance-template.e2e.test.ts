import { Server } from 'net'

import { MikroORM } from '@mikro-orm/core'
import { PostgreSqlDriver } from '@mikro-orm/postgresql'
import { SchemaGenerator } from '@mikro-orm/sqlite'
import { INestApplication } from '@nestjs/common'
import request from 'supertest'

import {
  AriesCredentialFormat,
  credentialFormatToCredentialRegistrationFormat,
  DidMethod,
  OpenId4VcCredentialFormat,
  ProtocolType,
} from 'common/types'
import {
  CreateIssuanceTemplateRequest,
  CreateIssuanceTemplateResponse,
  GetIssuanceTemplatesListRequest,
  PatchIssuanceTemplateFieldRequest,
  PatchIssuanceTemplateRequest,
} from 'issuance-template/dto'
import { CreateSchemaRequest, CreateSchemaResponse, GetSchemasListRequest } from 'schema-v2/dto'
import { Schema } from 'schema-v2/dto/common/schema'
import { RegisterSchemaRequest } from 'schema-v2/dto/register-schema'
import { sleep } from 'src/utils/timers'
import { uuid } from 'utils/misc'

import { generateRandomString, initializeMikroOrm, SchemaUtilities, startTestApp, UserUtilities } from './helpers'
import { IssuanceTemplateUtilities } from './helpers/issuance-template'

describe('E2E issuance templates management', () => {
  let ormSchemaGenerator: SchemaGenerator

  let nestApp: INestApplication
  let app: Server
  let orm: MikroORM<PostgreSqlDriver>

  beforeAll(async () => {
    orm = await initializeMikroOrm()
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
    registerRequest?: Partial<RegisterSchemaRequest>,
  ): Promise<CreateSchemaResponse | undefined> => {
    const schemaReq = { ...SchemaUtilities.makeCreateSchemaRequest(), ...schemaRequest }
    const schema = await SchemaUtilities.create(app, authToken, schemaReq)
    expect(schema).toBeDefined()

    const templateReq = {
      ...IssuanceTemplateUtilities.makeCreateTemplateRequest(),
      ...registerRequest,
      credentialFormat: registerRequest?.credentialFormat,
    }
    const registered = await SchemaUtilities.fakeRegister(orm, schema!.id, { ...templateReq })
    expect(registered).toBe(true)

    return schema
  }

  const createTestIssuanceTemplate = async (
    authToken: string,
    schemaRequest?: Partial<CreateSchemaRequest>,
    templateRequest?: Partial<CreateIssuanceTemplateRequest>,
  ): Promise<CreateIssuanceTemplateResponse | undefined> => {
    let schema: Schema | undefined
    if (!templateRequest?.schemaId) {
      const schemaReq = { ...SchemaUtilities.makeCreateSchemaRequest(), ...schemaRequest }
      schema = await SchemaUtilities.create(app, authToken, schemaReq)
    } else {
      schema = await SchemaUtilities.get(app, authToken, templateRequest.schemaId)
    }
    expect(schema).toBeDefined()

    const templateReq = {
      ...IssuanceTemplateUtilities.makeCreateTemplateRequest(),
      ...templateRequest,
      credentialFormat: credentialFormatToCredentialRegistrationFormat(
        templateRequest?.credentialFormat ?? OpenId4VcCredentialFormat.JwtVcJsonLd,
      ),
    }
    const registered = await SchemaUtilities.fakeRegister(orm, schema!.id, { ...templateReq })
    expect(registered).toBe(true)

    const template = await IssuanceTemplateUtilities.create(app, authToken, {
      ...templateReq,
      schemaId: schema?.id,
      credentialFormat: templateRequest?.credentialFormat,
      fields: schema?.fields.map((f) => ({ schemaFieldId: f.id, value: uuid() })),
    })
    expect(template).toBeDefined()

    return template
  }

  describe('IssuanceTemplate.GetList', () => {
    test('UnauthorizedRequest.ReturnUnauthorized', async () => {
      const response = await request(app).get('/issuance-templates')
      expect(response.status).toBe(401)
    })

    test('ForbiddenRequest.WrongUser.ReturnEmptyList"', async () => {
      const firstUserAuthToken = await UserUtilities.register(app)
      expect(firstUserAuthToken).not.toBeUndefined()

      await createTestIssuanceTemplate(firstUserAuthToken!)

      const secondUserAuthToken = await UserUtilities.register(app)
      expect(secondUserAuthToken).not.toBeUndefined()

      const response = await request(app).get('/issuance-templates').auth(secondUserAuthToken!, { type: 'bearer' })

      expect(response.status).toBe(200)
      expect(response.body.total).toBe(0)
    })

    test('BadRequest.ReturnBadRequest"', async () => {
      const userAuthToken = await UserUtilities.register(app)
      expect(userAuthToken).not.toBeUndefined()

      await createTestIssuanceTemplate(userAuthToken!)

      const response = await request(app)
        .get('/issuance-templates')
        .auth(userAuthToken!, { type: 'bearer' })
        .query({ limit: -1, offset: -1, text: generateRandomString(51) } as GetSchemasListRequest)
        .send()

      expect(response.status).toBe(400)
    })

    test('OKRequest.Filter.Empty.ReturnList"', async () => {
      const userAuthToken = await UserUtilities.register(app)
      expect(userAuthToken).toBeDefined()

      const template1 = await createTestIssuanceTemplate(userAuthToken!)
      const template2 = await createTestIssuanceTemplate(userAuthToken!)
      const template3 = await createTestIssuanceTemplate(userAuthToken!)

      const secondUserAuthToken = await UserUtilities.register(app)
      expect(secondUserAuthToken).toBeDefined()

      await createTestIssuanceTemplate(secondUserAuthToken!)
      await createTestIssuanceTemplate(secondUserAuthToken!)

      const response = await request(app).get('/issuance-templates').auth(userAuthToken!, { type: 'bearer' })

      expect(response.status).toBe(200)
      expect(response.body.total).toBe(3)
      expect(response.body.items[0].fields.length).toBe(template1?.fields?.length)
      expect(response.body.items[1].fields.length).toBe(template2?.fields?.length)
      expect(response.body.items[2].fields.length).toBe(template3?.fields?.length)
    })

    test('OKRequest.Filter.Pinned.ReturnList"', async () => {
      const userAuthToken = await UserUtilities.register(app)
      expect(userAuthToken).not.toBeUndefined()

      const template1 = await createTestIssuanceTemplate(userAuthToken!)
      await createTestIssuanceTemplate(userAuthToken!)
      await createTestIssuanceTemplate(userAuthToken!)

      const done = await IssuanceTemplateUtilities.setPinned(app, userAuthToken!, template1?.id ?? uuid(), true)
      expect(done).toBe(true)

      let response = await request(app)
        .get('/issuance-templates')
        .auth(userAuthToken!, { type: 'bearer' })
        .query({ isPinned: true } as GetIssuanceTemplatesListRequest)
        .send()

      expect(response.status).toBe(200)
      expect(response.body.total).toBe(1)

      response = await request(app)
        .get('/issuance-templates')
        .auth(userAuthToken!, { type: 'bearer' })
        .query({ isPinned: false } as GetIssuanceTemplatesListRequest)
        .send()

      expect(response.status).toBe(200)
      expect(response.body.total).toBe(2)
    })

    test('OKRequest.Filter.Text.ReturnList"', async () => {
      const userAuthToken = await UserUtilities.register(app)
      expect(userAuthToken).not.toBeUndefined()

      await createTestIssuanceTemplate(userAuthToken!, {}, { name: 'Template AAAA' })
      await createTestIssuanceTemplate(userAuthToken!, {}, { name: 'Template BBBB' })
      await createTestIssuanceTemplate(userAuthToken!, {}, { name: 'Template CCAA' })

      let response = await request(app)
        .get('/issuance-templates')
        .auth(userAuthToken!, { type: 'bearer' })
        .query({ text: 'AA' } as GetIssuanceTemplatesListRequest)
        .send()

      expect(response.status).toBe(200)
      expect(response.body.total).toBe(2)

      response = await request(app)
        .get('/issuance-templates')
        .auth(userAuthToken!, { type: 'bearer' })
        .query({ text: 'BBBB' } as GetIssuanceTemplatesListRequest)
        .send()

      expect(response.status).toBe(200)
      expect(response.body.total).toBe(1)

      response = await request(app)
        .get('/issuance-templates')
        .auth(userAuthToken!, { type: 'bearer' })
        .query({ text: 'CCCC' } as GetIssuanceTemplatesListRequest)
        .send()

      expect(response.status).toBe(200)
      expect(response.body.total).toBe(0)
    })

    test('OKRequest.Paging.ReturnList"', async () => {
      const userAuthToken = await UserUtilities.register(app)
      expect(userAuthToken).not.toBeUndefined()

      const template1 = await createTestIssuanceTemplate(userAuthToken!)
      const template2 = await createTestIssuanceTemplate(userAuthToken!)
      const template3 = await createTestIssuanceTemplate(userAuthToken!)
      const template4 = await createTestIssuanceTemplate(userAuthToken!)
      const template5 = await createTestIssuanceTemplate(userAuthToken!)

      let response = await request(app)
        .get('/issuance-templates')
        .auth(userAuthToken!, { type: 'bearer' })
        .query({ offset: 0, limit: 2 } as GetIssuanceTemplatesListRequest)
        .send()

      expect(response.status).toBe(200)
      expect(response.body.total).toBe(5)
      expect(response.body.items.length).toBe(2)
      expect(response.body.items[0].id).toBe(template1?.id)
      expect(response.body.items[1].id).toBe(template2?.id)

      response = await request(app)
        .get('/issuance-templates')
        .auth(userAuthToken!, { type: 'bearer' })
        .query({ offset: 2, limit: 2 } as GetIssuanceTemplatesListRequest)
        .send()

      expect(response.status).toBe(200)
      expect(response.body.total).toBe(5)
      expect(response.body.items.length).toBe(2)
      expect(response.body.items[0].id).toBe(template3?.id)
      expect(response.body.items[1].id).toBe(template4?.id)

      response = await request(app)
        .get('/issuance-templates')
        .auth(userAuthToken!, { type: 'bearer' })
        .query({ offset: 4, limit: 2 } as GetIssuanceTemplatesListRequest)
        .send()

      expect(response.status).toBe(200)
      expect(response.body.total).toBe(5)
      expect(response.body.items.length).toBe(1)
      expect(response.body.items[0].id).toBe(template5?.id)

      response = await request(app)
        .get('/issuance-templates')
        .auth(userAuthToken!, { type: 'bearer' })
        .query({ offset: 6, limit: 2 } as GetIssuanceTemplatesListRequest)
        .send()

      expect(response.status).toBe(200)
      expect(response.body.items.length).toBe(0)
      expect(response.body.total).toBe(5)
    })
  })

  describe('IssuanceTemplate.GetById', () => {
    test('UnauthorizedRequest.ReturnUnauthorized', async () => {
      const uid = uuid()
      const response = await request(app).get(`/issuance-templates/${uid}`)
      expect(response.status).toBe(401)
    })

    test('ForbiddenRequest.WrongUser.ReturnNotFound"', async () => {
      const firstUserAuthToken = await UserUtilities.register(app)
      expect(firstUserAuthToken).not.toBeUndefined()

      const template = await createTestIssuanceTemplate(firstUserAuthToken!)

      const secondUserAuthToken = await UserUtilities.register(app)
      expect(secondUserAuthToken).not.toBeUndefined()

      const response = await request(app)
        .get(`/issuance-templates/${template!.id}`)
        .auth(secondUserAuthToken!, { type: 'bearer' })

      expect(response.status).toBe(404)
    })

    test('BadRequest.ReturnNotFound', async () => {
      const userAuthToken = await UserUtilities.register(app)
      expect(userAuthToken).not.toBeUndefined()

      const response = await request(app).get(`/issuance-templates/${uuid()}`).auth(userAuthToken!, { type: 'bearer' })
      expect(response.status).toBe(404)
    })

    test('OKRequest.ReturnTemplate"', async () => {
      const userAuthToken = await UserUtilities.register(app)
      expect(userAuthToken).toBeDefined()

      const template = await createTestIssuanceTemplate(userAuthToken!)

      const response = await request(app)
        .get(`/issuance-templates/${template!.id}`)
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

  describe('IssuanceTemplate.Create', () => {
    test('UnauthorizedRequest.ReturnUnauthorized', async () => {
      const response = await request(app).post('/issuance-templates')
      expect(response.status).toBe(401)
    })

    describe('BadRequest.Name', () => {
      test('Empty.ReturnBadRequest', async () => {
        const userAuthToken = await UserUtilities.register(app)
        expect(userAuthToken).not.toBeUndefined()

        const response = await request(app)
          .post('/issuance-templates')
          .auth(userAuthToken!, { type: 'bearer' })
          .send({ name: '' } as CreateIssuanceTemplateRequest)

        expect(response.status).toBe(400)
        expect(response.body.message).toContain('name must be longer than or equal to 1 characters')
      })

      test('Long.ReturnBadRequest', async () => {
        const userAuthToken = await UserUtilities.register(app)
        expect(userAuthToken).not.toBeUndefined()

        const response = await request(app)
          .post('/issuance-templates')
          .auth(userAuthToken!, { type: 'bearer' })
          .send({ name: generateRandomString(501) } as CreateIssuanceTemplateRequest)

        expect(response.status).toBe(400)
        expect(response.body.message).toContain('name must be shorter than or equal to 500 characters')
      })

      test('NotUnique.ReturnBadRequest', async () => {
        const userAuthToken = await UserUtilities.register(app)
        expect(userAuthToken).not.toBeUndefined()

        const templateName = generateRandomString(30, true, true, false)

        await createTestIssuanceTemplate(userAuthToken!, {}, { name: templateName })

        const schema = await createTestSchema(userAuthToken!)
        const req = IssuanceTemplateUtilities.makeCreateTemplateRequest({ schemaId: schema?.id })
        const response = await request(app)
          .post('/issuance-templates')
          .auth(userAuthToken!, { type: 'bearer' })
          .send({ ...req, name: templateName })

        expect(response.status).toBe(400)
        expect(response.body.message).toContain(`Template with name ${templateName} already exists.`)
      })
    })

    describe('BadRequest.Protocol', () => {
      test('WrongProtocol.ReturnBadRequest', async () => {
        const userAuthToken = await UserUtilities.register(app)
        expect(userAuthToken).not.toBeUndefined()

        const response = await request(app)
          .post('/issuance-templates')
          .auth(userAuthToken!, { type: 'bearer' })
          .send({
            name: uuid(),
            protocol: uuid(),
          } as CreateIssuanceTemplateRequest)

        expect(response.status).toBe(400)
        expect(response.body.message).toContain('protocol must be one of the following values: Aries, OpenId4VC')
      })
    })

    describe('BadRequest.CredentialFormats', () => {
      test('ProtocolsIncompatible.ReturnBadRequest', async () => {
        const userAuthToken = await UserUtilities.register(app)
        expect(userAuthToken).not.toBeUndefined()

        let response = await request(app)
          .post('/issuance-templates')
          .auth(userAuthToken!, { type: 'bearer' })
          .send({
            name: uuid(),
            protocol: ProtocolType.Aries,
            credentialFormat: OpenId4VcCredentialFormat.JwtVcJsonLd,
          } as CreateIssuanceTemplateRequest)

        expect(response.status).toBe(400)
        expect(response.body.message).toContain('CredentialFormat is not compatible with the protocol')

        response = await request(app)
          .post('/issuance-templates')
          .auth(userAuthToken!, { type: 'bearer' })
          .send({
            name: uuid(),
            protocol: ProtocolType.Aries,
            credentialFormat: OpenId4VcCredentialFormat.SdJwtVc,
          } as CreateIssuanceTemplateRequest)

        expect(response.status).toBe(400)
        expect(response.body.message).toContain('CredentialFormat is not compatible with the protocol')

        response = await request(app)
          .post('/issuance-templates')
          .auth(userAuthToken!, { type: 'bearer' })
          .send({
            name: uuid(),
            protocol: ProtocolType.Aries,
            credentialFormat: OpenId4VcCredentialFormat.JwtVcJson,
          } as CreateIssuanceTemplateRequest)

        expect(response.status).toBe(400)
        expect(response.body.message).toContain('CredentialFormat is not compatible with the protocol')

        response = await request(app)
          .post('/issuance-templates')
          .auth(userAuthToken!, { type: 'bearer' })
          .send({
            name: uuid(),
            protocol: ProtocolType.Aries,
            credentialFormat: OpenId4VcCredentialFormat.LdpVc,
          } as CreateIssuanceTemplateRequest)

        expect(response.status).toBe(400)
        expect(response.body.message).toContain('CredentialFormat is not compatible with the protocol')

        response = await request(app)
          .post('/issuance-templates')
          .auth(userAuthToken!, { type: 'bearer' })
          .send({
            name: uuid(),
            protocol: ProtocolType.Oid4vc,
            credentialFormat: AriesCredentialFormat.AnoncredsIndy,
          } as CreateIssuanceTemplateRequest)

        expect(response.status).toBe(400)
        expect(response.body.message).toContain('CredentialFormat is not compatible with the protocol')

        response = await request(app)
          .post('/issuance-templates')
          .auth(userAuthToken!, { type: 'bearer' })
          .send({
            name: uuid(),
            protocol: ProtocolType.Oid4vc,
            credentialFormat: AriesCredentialFormat.AnoncredsW3c,
          } as CreateIssuanceTemplateRequest)

        expect(response.status).toBe(400)
        expect(response.body.message).toContain('CredentialFormat is not compatible with the protocol')
      })
    })

    describe('BadRequest.Network', () => {
      test('ProtocolsIncompatible.ReturnBadRequest', async () => {
        const userAuthToken = await UserUtilities.register(app)
        expect(userAuthToken).not.toBeUndefined()

        let response = await request(app)
          .post('/issuance-templates')
          .auth(userAuthToken!, { type: 'bearer' })
          .send({
            name: uuid(),
            protocol: ProtocolType.Aries,
            network: DidMethod.Key,
          } as CreateIssuanceTemplateRequest)

        expect(response.status).toBe(400)
        expect(response.body.message).toContain('DidMethod is not compatible with the protocol')

        response = await request(app)
          .post('/issuance-templates')
          .auth(userAuthToken!, { type: 'bearer' })
          .send({
            name: uuid(),
            protocol: ProtocolType.Oid4vc,
            network: DidMethod.Indy,
          } as CreateIssuanceTemplateRequest)

        expect(response.status).toBe(400)
        expect(response.body.message).toContain('DidMethod is not compatible with the protocol')
      })
    })

    describe('BadRequest.Did', () => {
      test('LongDid.ReturnBadRequest', async () => {
        const userAuthToken = await UserUtilities.register(app)
        expect(userAuthToken).not.toBeUndefined()

        const response = await request(app)
          .post('/issuance-templates')
          .auth(userAuthToken!, { type: 'bearer' })
          .send({
            name: uuid(),
            did: generateRandomString(1001),
          } as CreateIssuanceTemplateRequest)

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
          .post('/issuance-templates')
          .auth(userAuthToken!, { type: 'bearer' })
          .send({
            name: templateName,
            protocol: ProtocolType.Oid4vc,
            credentialFormat: OpenId4VcCredentialFormat.SdJwtVc,
            network: DidMethod.Key,
            did: uuid(),
            schemaId: uuid(),
            fields: [],
          } as CreateIssuanceTemplateRequest)

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
          .post('/issuance-templates')
          .auth(anotherUserAuthToken!, { type: 'bearer' })
          .send({
            name: uuid(),
            protocol: ProtocolType.Oid4vc,
            credentialFormat: OpenId4VcCredentialFormat.SdJwtVc,
            network: DidMethod.Key,
            did: uuid(),
            schemaId: schema?.id,
            fields: [],
          } as CreateIssuanceTemplateRequest)

        expect(response.status).toBe(404)
        expect(response.body.message).toContain(`Schema ${schema?.id} not exists.`)
      })

      test('NotRegistered.ReturnBadRequest', async () => {
        const userAuthToken = await UserUtilities.register(app)
        expect(userAuthToken).not.toBeUndefined()

        const schema = await SchemaUtilities.create(app, userAuthToken!)
        expect(schema).toBeDefined()

        const response = await request(app)
          .post('/issuance-templates')
          .auth(userAuthToken!, { type: 'bearer' })
          .send({
            name: uuid(),
            protocol: ProtocolType.Oid4vc,
            credentialFormat: OpenId4VcCredentialFormat.SdJwtVc,
            network: DidMethod.Key,
            did: uuid(),
            schemaId: schema?.id,
            fields: [],
          } as CreateIssuanceTemplateRequest)

        expect(response.status).toBe(400)
        expect(response.body.message).toContain(`Schema ${schema?.id} is not registered.`)
      })
    })

    describe('BadRequest.Fields', () => {
      test('NotUnique.ReturnBadRequest', async () => {
        const userAuthToken = await UserUtilities.register(app)
        expect(userAuthToken).not.toBeUndefined()

        const regData = {
          protocol: ProtocolType.Oid4vc,
          credentialFormat: OpenId4VcCredentialFormat.SdJwtVc,
          network: DidMethod.Key,
          did: uuid(),
        }

        const schema = await createTestSchema(
          userAuthToken!,
          {},
          { ...regData, credentialFormat: credentialFormatToCredentialRegistrationFormat(regData.credentialFormat) },
        )

        const schemaFieldId = schema?.fields[0].id
        const value = uuid()
        const response = await request(app)
          .post('/issuance-templates')
          .auth(userAuthToken!, { type: 'bearer' })
          .send({
            ...regData,
            name: uuid(),
            schemaId: schema?.id,
            fields: [
              { schemaFieldId, value },
              { schemaFieldId, value },
            ],
          } as CreateIssuanceTemplateRequest)

        expect(response.status).toBe(400)
        expect(response.body.message).toContain('Template field ids must be unique')
      })

      test('NotExistsInSchema.ReturnBadRequest', async () => {
        const userAuthToken = await UserUtilities.register(app)
        expect(userAuthToken).not.toBeUndefined()

        const regData = {
          protocol: ProtocolType.Oid4vc,
          credentialFormat: OpenId4VcCredentialFormat.SdJwtVc,
          network: DidMethod.Key,
          did: uuid(),
        }

        const schema = await createTestSchema(
          userAuthToken!,
          {},
          { ...regData, credentialFormat: credentialFormatToCredentialRegistrationFormat(regData.credentialFormat) },
        )

        const schemaFieldId = uuid()
        const value = uuid()
        const response = await request(app)
          .post('/issuance-templates')
          .auth(userAuthToken!, { type: 'bearer' })
          .send({
            ...regData,
            name: uuid(),
            schemaId: schema?.id,
            fields: [{ schemaFieldId, value }],
          } as CreateIssuanceTemplateRequest)

        expect(response.status).toBe(400)
        expect(response.body.message).toContain(`Some requests fields ids weren't present in the template schema`)
      })
    })

    test('OKRequest.Created.ReturnTemplateDetails"', async () => {
      const userAuthToken = await UserUtilities.register(app)
      expect(userAuthToken).not.toBeUndefined()

      const regData = {
        protocol: ProtocolType.Aries,
        credentialFormat: AriesCredentialFormat.AnoncredsIndy,
        network: DidMethod.Indy,
        did: uuid(),
      }
      const schema = await createTestSchema(
        userAuthToken!,
        {},
        { ...regData, credentialFormat: credentialFormatToCredentialRegistrationFormat(regData.credentialFormat) },
      )

      const templateName = uuid()
      const templateValueF1 = uuid()

      const response = await request(app)
        .post('/issuance-templates')
        .auth(userAuthToken!, { type: 'bearer' })
        .send({
          ...regData,
          name: templateName,
          schemaId: schema?.id,
          fields: [{ schemaFieldId: schema!.fields[0].id, value: templateValueF1 }],
        } as CreateIssuanceTemplateRequest)

      expect(response.status).toBe(201)
      expect(response.body.id).toBeDefined()
      expect(response.body.name).toBe(templateName)
      expect(response.body.protocol).toBe(regData.protocol)
      expect(response.body.credentialFormat).toBe(regData.credentialFormat)
      expect(response.body.network).toBe(regData.network)
      expect(response.body.did).toBe(regData.did)
      expect(response.body.schema.id).toBe(schema?.id)
      expect(response.body.fields[0]?.schemaFieldId).toBe(schema?.fields[0]?.id)
      expect(response.body.fields[0]?.value).toBe(templateValueF1)
    })
  })

  describe('IssuanceTemplate.Patch', () => {
    test('UnauthorizedRequest.ReturnUnauthorized', async () => {
      const uid = uuid()
      const response = await request(app).patch(`/issuance-templates/${uid}`)
      expect(response.status).toBe(401)
    })

    test('ForbiddenRequest.WrongUser.ReturnNotFound"', async () => {
      const firstUserAuthToken = await UserUtilities.register(app)
      expect(firstUserAuthToken).toBeDefined()

      const template = await createTestIssuanceTemplate(firstUserAuthToken!)

      const secondUserAuthToken = await UserUtilities.register(app)
      expect(secondUserAuthToken).not.toBeUndefined()

      const response = await request(app)
        .patch(`/issuance-templates/${template?.id}`)
        .auth(secondUserAuthToken!, { type: 'bearer' })

      expect(response.status).toBe(404)
    })

    test('BadRequest.NotExistTemplateId.ReturnNotFound"', async () => {
      const userAuthToken = await UserUtilities.register(app)
      expect(userAuthToken).toBeDefined()

      const response = await request(app)
        .patch(`/issuance-templates/${uuid()}`)
        .auth(userAuthToken!, { type: 'bearer' })

      expect(response.status).toBe(404)
    })

    test('BadRequest.Pinned.ReturnBadRequest', async () => {
      const userAuthToken = await UserUtilities.register(app)
      expect(userAuthToken).not.toBeUndefined()

      const template = await createTestIssuanceTemplate(userAuthToken!)

      const response = await request(app)
        .patch(`/issuance-templates/${template?.id}`)
        .auth(userAuthToken!, { type: 'bearer' })
        .send({ isPinned: uuid() })

      expect(response.status).toBe(400)
      expect(response.body.message).toContain('isPinned must be a boolean value')
    })

    test('OKRequest.Pinned.Changed.ReturnOK', async () => {
      const userAuthToken = await UserUtilities.register(app)
      expect(userAuthToken).not.toBeUndefined()

      const template = await createTestIssuanceTemplate(userAuthToken!)

      let response = await request(app)
        .patch(`/issuance-templates/${template?.id}`)
        .auth(userAuthToken!, { type: 'bearer' })
        .send({ isPinned: true })

      expect(response.status).toBe(200)

      let patched = await IssuanceTemplateUtilities.get(app, userAuthToken!, template!.id)
      expect(patched.isPinned).toBe(true)

      response = await request(app)
        .patch(`/issuance-templates/${template?.id}`)
        .auth(userAuthToken!, { type: 'bearer' })
        .send({ isPinned: false })

      expect(response.status).toBe(200)

      patched = await IssuanceTemplateUtilities.get(app, userAuthToken!, template!.id)
      expect(patched.isPinned).toBe(false)
    })

    describe('BadRequest.Position', () => {
      test('WrongPreviousTemplate.ReturnBadRequest', async () => {
        const userAuthToken = await UserUtilities.register(app)
        expect(userAuthToken).not.toBeUndefined()

        const template = await createTestIssuanceTemplate(userAuthToken!)

        const previousTemplateId = uuid()
        const response = await request(app)
          .patch(`/issuance-templates/${template?.id}`)
          .auth(userAuthToken!, { type: 'bearer' })
          .send({ previousTemplateId })

        expect(response.status).toBe(400)
        expect(response.body.message).toContain(`Previous issuance template with id ${previousTemplateId} not found.`)
      })

      test('NotOwnPreviousTemplate.ReturnBadRequest', async () => {
        const firstUserAuthToken = await UserUtilities.register(app)
        expect(firstUserAuthToken).not.toBeUndefined()

        const template1 = await createTestIssuanceTemplate(firstUserAuthToken!)

        const secondUserAuthToken = await UserUtilities.register(app)
        expect(secondUserAuthToken).not.toBeUndefined()

        const template2 = await createTestIssuanceTemplate(secondUserAuthToken!)

        const previousTemplateId = template2?.id
        const response = await request(app)
          .patch(`/issuance-templates/${template1?.id}`)
          .auth(firstUserAuthToken!, { type: 'bearer' })
          .send({ previousTemplateId: template2?.id })

        expect(response.status).toBe(400)
        expect(response.body.message).toContain(`Previous issuance template with id ${previousTemplateId} not found.`)
      })
    })

    describe('OKRequest.Position', () => {
      test('ToFirst.Moved.ReturnOK', async () => {
        const userAuthToken = await UserUtilities.register(app)
        expect(userAuthToken).toBeDefined()

        const template1 = await createTestIssuanceTemplate(userAuthToken!)
        const template2 = await createTestIssuanceTemplate(userAuthToken!)
        const template3 = await createTestIssuanceTemplate(userAuthToken!)
        const template4 = await createTestIssuanceTemplate(userAuthToken!)

        const response = await request(app)
          .patch(`/issuance-templates/${template3?.id}`)
          .auth(userAuthToken!, { type: 'bearer' })
          .send({ previousTemplateId: '' } as PatchIssuanceTemplateRequest)

        expect(response.status).toBe(200)

        const templates = await IssuanceTemplateUtilities.getList(app, userAuthToken!)

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

        const template1 = await createTestIssuanceTemplate(userAuthToken!)
        const template2 = await createTestIssuanceTemplate(userAuthToken!)
        const template3 = await createTestIssuanceTemplate(userAuthToken!)
        const template4 = await createTestIssuanceTemplate(userAuthToken!)

        const response = await request(app)
          .patch(`/issuance-templates/${template3?.id}`)
          .auth(userAuthToken!, { type: 'bearer' })
          .send({ previousTemplateId: template1?.id } as PatchIssuanceTemplateRequest)

        expect(response.status).toBe(200)

        const templates = await IssuanceTemplateUtilities.getList(app, userAuthToken!)

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
        const template1 = await createTestIssuanceTemplate(userAuthToken!, {}, { name: 'template 1' })
        const template2 = await createTestIssuanceTemplate(userAuthToken!, {}, { name: 'template 2' })
        const template3 = await createTestIssuanceTemplate(userAuthToken!, {}, { name: 'template 3' })
        const template4 = await createTestIssuanceTemplate(userAuthToken!, {}, { name: 'template 4' })
        const template5 = await createTestIssuanceTemplate(userAuthToken!, {}, { name: 'template 5' })
        const template6 = await createTestIssuanceTemplate(userAuthToken!, {}, { name: 'template 6' })
        const template7 = await createTestIssuanceTemplate(userAuthToken!, {}, { name: 'template 7' })

        // step 2
        let done = await IssuanceTemplateUtilities.setPinned(app, userAuthToken!, template5!.id, true)
        expect(done).toBe(true)
        done = await IssuanceTemplateUtilities.setPinned(app, userAuthToken!, template6!.id, true)
        expect(done).toBe(true)
        done = await IssuanceTemplateUtilities.setPinned(app, userAuthToken!, template7!.id, true)
        expect(done).toBe(true)

        // step 3
        let response = await request(app)
          .patch(`/issuance-templates/${template3?.id}`)
          .auth(userAuthToken!, { type: 'bearer' })
          .send({ previousTemplateId: template1?.id } as PatchIssuanceTemplateRequest)

        expect(response.status).toBe(200)

        let list = await IssuanceTemplateUtilities.getList(app, userAuthToken!, { isPinned: false })

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
          .patch(`/issuance-templates/${template6?.id}`)
          .auth(userAuthToken!, { type: 'bearer' })
          .send({ previousTemplateId: template7?.id } as PatchIssuanceTemplateRequest)

        expect(response.status).toBe(200)

        list = await IssuanceTemplateUtilities.getList(app, userAuthToken!, { isPinned: true })

        expect(list.items.length).toBe(3)

        expect(list.items[0].id).toBe(template5?.id)
        expect(list.items[0].orderIndex).toBe(0)

        expect(list.items[1].id).toBe(template7?.id)
        expect(list.items[1].orderIndex).toBe(1)

        expect(list.items[2].id).toBe(template6?.id)
        expect(list.items[2].orderIndex).toBe(2)

        // step 5
        done = await IssuanceTemplateUtilities.setPinned(app, userAuthToken!, template7!.id, false)
        expect(done).toBe(true)

        response = await request(app)
          .patch(`/issuance-templates/${template7?.id}`)
          .auth(userAuthToken!, { type: 'bearer' })
          .send({ previousTemplateId: template3?.id } as PatchIssuanceTemplateRequest)

        expect(response.status).toBe(200)

        list = await IssuanceTemplateUtilities.getList(app, userAuthToken!, { isPinned: false })

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
        done = await IssuanceTemplateUtilities.setPinned(app, userAuthToken!, template1!.id, true)
        expect(done).toBe(true)

        response = await request(app)
          .patch(`/issuance-templates/${template1?.id}`)
          .auth(userAuthToken!, { type: 'bearer' })
          .send({ previousTemplateId: template5?.id } as PatchIssuanceTemplateRequest)

        expect(response.status).toBe(200)

        list = await IssuanceTemplateUtilities.getList(app, userAuthToken!, { isPinned: true })

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

        const template = await createTestIssuanceTemplate(userAuthToken!, {}, { name: 'template 1' })

        const response = await request(app)
          .patch(`/issuance-templates/${template?.id}`)
          .auth(userAuthToken!, { type: 'bearer' })
          .send({ name: '' } as CreateIssuanceTemplateRequest)

        expect(response.status).toBe(400)
        expect(response.body.message).toContain('name must be longer than or equal to 1 characters')
      })

      test('Long.ReturnBadRequest', async () => {
        const userAuthToken = await UserUtilities.register(app)
        expect(userAuthToken).not.toBeUndefined()

        const template = await createTestIssuanceTemplate(userAuthToken!, {}, { name: 'template 1' })

        const response = await request(app)
          .patch(`/issuance-templates/${template?.id}`)
          .auth(userAuthToken!, { type: 'bearer' })
          .send({ name: generateRandomString(501) } as CreateIssuanceTemplateRequest)

        expect(response.status).toBe(400)
        expect(response.body.message).toContain('name must be shorter than or equal to 500 characters')
      })

      test('NotUnique.ReturnBadRequest', async () => {
        const userAuthToken = await UserUtilities.register(app)
        expect(userAuthToken).not.toBeUndefined()

        const templateName = generateRandomString(30, true, true, false)
        await createTestIssuanceTemplate(userAuthToken!, {}, { name: templateName })

        const template2 = await createTestIssuanceTemplate(userAuthToken!)

        const response = await request(app)
          .patch(`/issuance-templates/${template2?.id}`)
          .auth(userAuthToken!, { type: 'bearer' })
          .send({ name: templateName } as CreateIssuanceTemplateRequest)

        expect(response.status).toBe(400)
        expect(response.body.message).toContain(`Template with name ${templateName} already exists.`)
      })
    })

    describe('BadRequest.Fields', () => {
      test('NotUnique.ReturnBadRequest', async () => {
        const userAuthToken = await UserUtilities.register(app)
        expect(userAuthToken).not.toBeUndefined()

        const schema = await createTestSchema(userAuthToken!)
        const template = await createTestIssuanceTemplate(userAuthToken!, {}, { schemaId: schema?.id })

        const schemaFieldId = schema?.fields[0].id
        const value = uuid()
        const response = await request(app)
          .patch(`/issuance-templates/${template?.id}`)
          .auth(userAuthToken!, { type: 'bearer' })
          .send({
            fields: [
              { schemaFieldId, value },
              { schemaFieldId, value },
            ],
          } as PatchIssuanceTemplateRequest)

        expect(response.status).toBe(400)
        expect(response.body.message).toContain("All fields's elements must be unique")
      })

      test('NotExistsInSchema.ReturnBadRequest', async () => {
        const userAuthToken = await UserUtilities.register(app)
        expect(userAuthToken).not.toBeUndefined()

        const schema = await createTestSchema(userAuthToken!)
        const template = await createTestIssuanceTemplate(userAuthToken!, {}, { schemaId: schema?.id })

        const schemaFieldId = uuid()
        const value = uuid()
        const response = await request(app)
          .patch(`/issuance-templates/${template?.id}`)
          .auth(userAuthToken!, { type: 'bearer' })
          .send({
            fields: [{ schemaFieldId, value }],
          } as PatchIssuanceTemplateRequest)

        expect(response.status).toBe(400)
        expect(response.body.message).toContain(`Some requests fields ids weren't present in the template schema`)
      })
    })

    test('OKRequest.Complete.Patched"', async () => {
      const userAuthToken = await UserUtilities.register(app)
      expect(userAuthToken).not.toBeUndefined()

      const schema = await createTestSchema(userAuthToken!)
      const template = await createTestIssuanceTemplate(userAuthToken!, {}, { schemaId: schema?.id })

      const name = uuid()
      const fields = [{ schemaFieldId: schema!.fields[0].id, value: 'freeValue' } as PatchIssuanceTemplateFieldRequest]

      const response = await request(app)
        .patch(`/issuance-templates/${template?.id}`)
        .auth(userAuthToken!, { type: 'bearer' })
        .send({
          name,
          fields,
        } as PatchIssuanceTemplateRequest)

      expect(response.status).toBe(200)

      const patchedTemplate = await IssuanceTemplateUtilities.get(app, userAuthToken!, template!.id)

      expect(patchedTemplate.id).toBe(template?.id)
      expect(patchedTemplate.protocol).toBe(template?.protocol)
      expect(patchedTemplate.credentialFormat).toBe(template?.credentialFormat)
      expect(patchedTemplate.network).toBe(template?.network)
      expect(patchedTemplate.did).toBe(template?.did)
      expect(patchedTemplate.schema.id).toBe(template?.schema.id)
      expect(patchedTemplate.fields?.length).toBe(1)
      expect(patchedTemplate.fields[0].schemaFieldId).toBe(schema?.fields[0].id)
      expect(patchedTemplate.fields[0].schemaFieldName).toBe(schema?.fields[0].name)
      expect(patchedTemplate.fields[0].value).toBe(fields[0].value)
    })
  })

  describe('IssuanceTemplate.Delete', () => {
    test('UnauthorizedRequest.ReturnUnauthorized', async () => {
      const response = await request(app).delete(`/issuance-templates/${uuid()}`)
      expect(response.status).toBe(401)
    })

    test('ForbiddenRequest.WrongUser.ReturnNotFound"', async () => {
      const firstUserAuthToken = await UserUtilities.register(app)
      expect(firstUserAuthToken).not.toBeUndefined()

      const template = await createTestIssuanceTemplate(firstUserAuthToken!)

      const secondUserAuthToken = await UserUtilities.register(app)
      expect(secondUserAuthToken).not.toBeUndefined()

      const response = await request(app)
        .delete(`/issuance-templates/${template!.id}`)
        .auth(secondUserAuthToken!, { type: 'bearer' })

      expect(response.status).toBe(404)
    })

    test('NotExist.ReturnNotFound', async () => {
      const userAuthToken = await UserUtilities.register(app)
      expect(userAuthToken).not.toBeUndefined()

      const response = await request(app)
        .delete(`/issuance-templates/${uuid()}`)
        .auth(userAuthToken!, { type: 'bearer' })
      expect(response.status).toBe(404)
    })

    test('OKRequest.DeleteTemplate"', async () => {
      const userAuthToken = await UserUtilities.register(app)
      expect(userAuthToken).toBeDefined()

      const template = await createTestIssuanceTemplate(userAuthToken!)

      const response = await request(app)
        .delete(`/issuance-templates/${template!.id}`)
        .auth(userAuthToken!, { type: 'bearer' })

      expect(response.status).toBe(200)
    })
  })
})
