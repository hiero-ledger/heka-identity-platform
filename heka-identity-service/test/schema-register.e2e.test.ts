import { Server } from 'net'

import { SchemaGenerator } from '@mikro-orm/sqlite'
import { INestApplication } from '@nestjs/common'
import request from 'supertest'

import { Role } from 'common/auth'
import {
  AriesCredentialRegistrationFormat,
  CredentialRegistrationFormat,
  DidMethod,
  OpenId4VCCredentialRegistrationFormat,
  ProtocolType,
} from 'common/types'
import { GetSchemaRegistrationRequest } from 'schema-v2/dto/get-schema-registration'
import { RegisterSchemaRequest } from 'schema-v2/dto/register-schema'
import { sleep } from 'src/utils/timers'
import { uuid } from 'utils/misc'

import { generateRandomString, initializeMikroOrm, SchemaUtilities, startTestApp, UserUtilities } from './helpers'
import { DidUtilities } from './helpers/did'
import { OpenID4VCIssuerUtilities } from './helpers/issuer'

describe('E2E schemas registration', () => {
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

  const testRegister = async (testCase: {
    schemaId: string
    authToken: string
    protocol: ProtocolType
    credentialFormat: CredentialRegistrationFormat
    network: DidMethod
    did: string
  }) => {
    const response = await request(app)
      .post(`/v2/schemas/${testCase.schemaId}/registration`)
      .auth(testCase.authToken, { type: 'bearer' })
      .send({
        protocol: testCase.protocol,
        credentialFormat: testCase.credentialFormat,
        network: testCase.network,
        did: testCase.did,
      } as RegisterSchemaRequest)
    expect(response.status).toBe(201)
    expect(response.body.credentials).toBeDefined()
  }

  describe('Schema registration', () => {
    test('UnauthorizedRequest.ReturnUnauthorized', async () => {
      const response = await request(app).post(`/v2/schemas/${uuid()}/registration`)
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

      // Try to register not own schema
      const response = await request(app)
        .post(`/v2/schemas/${schema?.id}/registration`)
        .auth(secondUserAuthToken!, { type: 'bearer' })
        .send({
          protocol: ProtocolType.Aries,
          credentialFormat: AriesCredentialRegistrationFormat.Anoncreds,
          network: DidMethod.Indy,
          did: uuid(),
        } as RegisterSchemaRequest)

      // Schema shouldn't be found
      expect(response.status).toBe(404)
    })

    test('BadRequest.WrongSchema.ReturnNotFound', async () => {
      // Create the user and his schemas
      const userAuthToken = await UserUtilities.register(app)
      expect(userAuthToken).not.toBeUndefined()

      // Try to register not existed schema
      const response = await request(app)
        .post(`/v2/schemas/${uuid()}/registration`)
        .auth(userAuthToken!, { type: 'bearer' })
        .send({
          protocol: ProtocolType.Aries,
          credentialFormat: AriesCredentialRegistrationFormat.Anoncreds,
          network: DidMethod.Indy,
          did: uuid(),
        } as RegisterSchemaRequest)

      // Schema shouldn't be found
      expect(response.status).toBe(404)
    })

    test('BadRequest.Aries.WrongFormat.ReturnBadRequest', async () => {
      // Create the user and his schemas
      const userAuthToken = await UserUtilities.register(app)
      expect(userAuthToken).not.toBeUndefined()

      const schema1 = await SchemaUtilities.create(app, userAuthToken!)
      expect(schema1).toBeDefined()

      // Try to register schema
      let response = await request(app)
        .post(`/v2/schemas/${schema1?.id}/registration`)
        .auth(userAuthToken!, { type: 'bearer' })
        .send({
          protocol: ProtocolType.Aries,
          credentialFormat: OpenId4VCCredentialRegistrationFormat.JwtVcJson,
          network: DidMethod.Indy,
          did: uuid(),
        } as RegisterSchemaRequest)

      // Should be returned bad request
      expect(response.status).toBe(400)
      expect(response.body.message).toContain('CredentialFormat is not compatible with the protocol')

      // Try to register schema
      response = await request(app)
        .post(`/v2/schemas/${schema1?.id}/registration`)
        .auth(userAuthToken!, { type: 'bearer' })
        .send({
          protocol: ProtocolType.Aries,
          credentialFormat: OpenId4VCCredentialRegistrationFormat.LdpVc,
          network: DidMethod.Indy,
          did: uuid(),
        } as RegisterSchemaRequest)

      // Should be returned bad request
      expect(response.status).toBe(400)
      expect(response.body.message).toContain('CredentialFormat is not compatible with the protocol')

      // Try to register schema
      response = await request(app)
        .post(`/v2/schemas/${schema1?.id}/registration`)
        .auth(userAuthToken!, { type: 'bearer' })
        .send({
          protocol: ProtocolType.Aries,
          credentialFormat: OpenId4VCCredentialRegistrationFormat.SdJwtVc,
          network: DidMethod.Indy,
          did: uuid(),
        } as RegisterSchemaRequest)

      // Should be returned bad request
      expect(response.status).toBe(400)
      expect(response.body.message).toContain('CredentialFormat is not compatible with the protocol')

      // Try to register schema
      response = await request(app)
        .post(`/v2/schemas/${schema1?.id}/registration`)
        .auth(userAuthToken!, { type: 'bearer' })
        .send({
          protocol: ProtocolType.Aries,
          credentialFormat: OpenId4VCCredentialRegistrationFormat.JwtVcJsonLd,
          network: DidMethod.Indy,
          did: uuid(),
        } as RegisterSchemaRequest)

      // Should be returned bad request
      expect(response.status).toBe(400)
      expect(response.body.message).toContain('CredentialFormat is not compatible with the protocol')
    })

    test('BadRequest.Oid4vc.WrongFormat.ReturnBadRequest', async () => {
      // Create the user and his schemas
      const userAuthToken = await UserUtilities.register(app)
      expect(userAuthToken).not.toBeUndefined()

      const schema1 = await SchemaUtilities.create(app, userAuthToken!)
      expect(schema1).toBeDefined()

      // Try to register schema
      const response = await request(app)
        .post(`/v2/schemas/${schema1?.id}/registration`)
        .auth(userAuthToken!, { type: 'bearer' })
        .send({
          protocol: ProtocolType.Oid4vc,
          credentialFormat: AriesCredentialRegistrationFormat.Anoncreds,
          network: DidMethod.Indy,
          did: uuid(),
        } as RegisterSchemaRequest)

      // Should be returned bad request
      expect(response.status).toBe(400)
      expect(response.body.message).toContain('CredentialFormat is not compatible with the protocol')
    })

    test('BadRequest.Aries.WrongNetwork.ReturnBadRequest', async () => {
      // Create the user and his schemas
      const userAuthToken = await UserUtilities.register(app)
      expect(userAuthToken).not.toBeUndefined()

      const schema1 = await SchemaUtilities.create(app, userAuthToken!)
      expect(schema1).toBeDefined()

      // Try to register schema
      const response = await request(app)
        .post(`/v2/schemas/${schema1?.id}/registration`)
        .auth(userAuthToken!, { type: 'bearer' })
        .send({
          protocol: ProtocolType.Aries,
          credentialFormat: AriesCredentialRegistrationFormat.Anoncreds,
          network: DidMethod.Key,
          did: uuid(),
        } as RegisterSchemaRequest)

      // Should be returned bad request
      expect(response.status).toBe(400)
      expect(response.body.message).toContain('DidMethod is not compatible with the protocol')
    })

    test('BadRequest.Oid4vc.WrongNetwork.ReturnBadRequest', async () => {
      // Create the user and his schemas
      const userAuthToken = await UserUtilities.register(app)
      expect(userAuthToken).not.toBeUndefined()

      const schema1 = await SchemaUtilities.create(app, userAuthToken!)
      expect(schema1).toBeDefined()

      // Try to register schema
      const response = await request(app)
        .post(`/v2/schemas/${schema1?.id}/registration`)
        .auth(userAuthToken!, { type: 'bearer' })
        .send({
          protocol: ProtocolType.Oid4vc,
          credentialFormat: OpenId4VCCredentialRegistrationFormat.JwtVcJsonLd,
          network: DidMethod.Indy,
          did: uuid(),
        } as RegisterSchemaRequest)

      // Should be returned bad request
      expect(response.status).toBe(400)
      expect(response.body.message).toContain('DidMethod is not compatible with the protocol')
    })

    test('BadRequest.WrongDid.ReturnBadRequest', async () => {
      // Create the user and his schemas
      const userAuthToken = await UserUtilities.register(app)
      expect(userAuthToken).not.toBeUndefined()

      const schema1 = await SchemaUtilities.create(app, userAuthToken!)
      expect(schema1).toBeDefined()

      // Try to register schema
      const response = await request(app)
        .post(`/v2/schemas/${schema1?.id}/registration`)
        .auth(userAuthToken!, { type: 'bearer' })
        .send({
          protocol: ProtocolType.Oid4vc,
          credentialFormat: OpenId4VCCredentialRegistrationFormat.JwtVcJsonLd,
          network: DidMethod.Key,
          did: generateRandomString(1001),
        } as RegisterSchemaRequest)

      // Should be returned bad request
      expect(response.status).toBe(400)
    })

    test('BadRequest.Aries.NotUnique.ReturnBadRequest', async () => {
      const userAuthToken = await UserUtilities.register(app, { role: Role.Admin })
      expect(userAuthToken).not.toBeUndefined()

      const did = await DidUtilities.create(app, userAuthToken!, DidMethod.Indy)
      expect(did).toBeDefined()

      const schema = await SchemaUtilities.create(app, userAuthToken!)
      expect(schema).toBeDefined()

      let response = await request(app)
        .post(`/v2/schemas/${schema?.id}/registration`)
        .auth(userAuthToken!, { type: 'bearer' })
        .send({
          protocol: ProtocolType.Aries,
          credentialFormat: AriesCredentialRegistrationFormat.Anoncreds,
          network: DidMethod.Indy,
          did: did!.id,
        } as RegisterSchemaRequest)
      expect(response.status).toBe(201)

      response = await request(app)
        .post(`/v2/schemas/${schema?.id}/registration`)
        .auth(userAuthToken!, { type: 'bearer' })
        .send({
          protocol: ProtocolType.Aries,
          credentialFormat: AriesCredentialRegistrationFormat.Anoncreds,
          network: DidMethod.Indy,
          did: did!.id,
        } as RegisterSchemaRequest)
      expect(response.status).toBe(400)
      expect(response.body.message).toContain('Schema is already registered here')
    })

    test('BadRequest.Oid4vc.NotUnique.ReturnBadRequest', async () => {
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

      let response = await request(app)
        .post(`/v2/schemas/${schema?.id}/registration`)
        .auth(userAuthToken!, { type: 'bearer' })
        .send({
          protocol: ProtocolType.Oid4vc,
          credentialFormat: OpenId4VCCredentialRegistrationFormat.JwtVcJson,
          network: DidMethod.Key,
          did: did!.id,
        } as RegisterSchemaRequest)
      expect(response.status).toBe(201)

      response = await request(app)
        .post(`/v2/schemas/${schema?.id}/registration`)
        .auth(userAuthToken!, { type: 'bearer' })
        .send({
          protocol: ProtocolType.Oid4vc,
          credentialFormat: OpenId4VCCredentialRegistrationFormat.LdpVc,
          network: DidMethod.Key,
          did: did!.id,
        } as RegisterSchemaRequest)
      expect(response.status).toBe(201)

      response = await request(app)
        .post(`/v2/schemas/${schema?.id}/registration`)
        .auth(userAuthToken!, { type: 'bearer' })
        .send({
          protocol: ProtocolType.Oid4vc,
          credentialFormat: OpenId4VCCredentialRegistrationFormat.JwtVcJson,
          network: DidMethod.Key,
          did: did!.id,
        } as RegisterSchemaRequest)
      expect(response.status).toBe(400)
      expect(response.body.message).toContain('Schema is already registered here')
    })

    test('OKRequest.Aries.Indy.RegisterSchema"', async () => {
      const userAuthToken = await UserUtilities.register(app, { role: Role.Admin })
      expect(userAuthToken).not.toBeUndefined()

      const didIndy = await DidUtilities.create(app, userAuthToken!, DidMethod.Indy)
      expect(didIndy).toBeDefined()

      const schema = await SchemaUtilities.create(app, userAuthToken!)
      expect(schema).toBeDefined()

      await testRegister({
        schemaId: schema!.id,
        authToken: userAuthToken!,
        protocol: ProtocolType.Aries,
        credentialFormat: AriesCredentialRegistrationFormat.Anoncreds,
        network: DidMethod.Indy,
        did: didIndy!.id,
      })
    })

    test('OKRequest.Aries.Hedera.RegisterSchema"', async () => {
      const userAuthToken = await UserUtilities.register(app, { role: Role.Admin })
      expect(userAuthToken).not.toBeUndefined()

      const didHedera = await DidUtilities.create(app, userAuthToken!, DidMethod.Hedera)
      expect(didHedera).toBeDefined()

      const schema = await SchemaUtilities.create(app, userAuthToken!)
      expect(schema).toBeDefined()

      await testRegister({
        schemaId: schema!.id,
        authToken: userAuthToken!,
        protocol: ProtocolType.Aries,
        credentialFormat: AriesCredentialRegistrationFormat.Anoncreds,
        network: DidMethod.Hedera,
        did: didHedera!.id,
      })
    })

    test('OKRequest.Oid4vc.Key.RegisterSchema"', async () => {
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

      for (const format of Object.values(OpenId4VCCredentialRegistrationFormat)) {
        await testRegister({
          schemaId: schema!.id,
          authToken: userAuthToken!,
          protocol: ProtocolType.Oid4vc,
          credentialFormat: format,
          network: DidMethod.Key,
          did: did!.id,
        })
      }
    })

    // ToDo: Remove skip when DidMethod.IndyBesu will be enabled
    test.skip('OKRequest.Aries.IndyBesu.RegisterSchema"', async () => {
      const userAuthToken = await UserUtilities.register(app, { role: Role.Admin })
      expect(userAuthToken).not.toBeUndefined()

      const schema = await SchemaUtilities.create(app, userAuthToken!)
      expect(schema).toBeDefined()

      const did = await DidUtilities.create(app, userAuthToken!, DidMethod.IndyBesu)
      expect(did).toBeDefined()

      await testRegister({
        schemaId: schema!.id,
        authToken: userAuthToken!,
        protocol: ProtocolType.Aries,
        credentialFormat: AriesCredentialRegistrationFormat.Anoncreds,
        network: DidMethod.IndyBesu,
        did: did!.id,
      })
    })

    // ToDo: Remove skip when DidMethod.IndyBesu will be enabled
    test.skip('OKRequest.Oid4vc.IndyBesy.RegisterSchema"', async () => {
      const userAuthToken = await UserUtilities.register(app, { role: Role.Admin })
      expect(userAuthToken).not.toBeUndefined()

      const schema = await SchemaUtilities.create(app, userAuthToken!)
      expect(schema).toBeDefined()

      const did = await DidUtilities.create(app, userAuthToken!, DidMethod.IndyBesu)
      expect(did).toBeDefined()

      const issuer = await OpenID4VCIssuerUtilities.create(app, userAuthToken!, {
        publicIssuerId: did?.id,
      })
      expect(issuer).toBeDefined()

      for (const format of Object.values(OpenId4VCCredentialRegistrationFormat)) {
        await testRegister({
          schemaId: schema!.id,
          authToken: userAuthToken!,
          protocol: ProtocolType.Oid4vc,
          credentialFormat: format,
          network: DidMethod.IndyBesu,
          did: did!.id,
        })
      }
    })
  })

  describe('Get schema registration', () => {
    test('UnauthorizedRequest.ReturnUnauthorized', async () => {
      const response = await request(app)
        .get(`/v2/schemas/${uuid()}/registration`)
        .query({
          protocol: ProtocolType.Aries,
          credentialFormat: AriesCredentialRegistrationFormat.Anoncreds,
          network: DidMethod.Indy,
          did: uuid(),
        } as GetSchemaRegistrationRequest)
      expect(response.status).toBe(401)
    })

    test('ForbiddenRequest.WrongUser.ReturnNotFound"', async () => {
      const firstUserAuthToken = await UserUtilities.register(app)
      expect(firstUserAuthToken).not.toBeUndefined()

      const schema = await SchemaUtilities.create(app, firstUserAuthToken!)
      expect(schema).toBeDefined()

      const secondUserAuthToken = await UserUtilities.register(app)
      expect(secondUserAuthToken).not.toBeUndefined()

      const response = await request(app)
        .get(`/v2/schemas/${schema?.id}/registration`)
        .auth(secondUserAuthToken!, { type: 'bearer' })
        .query({
          protocol: ProtocolType.Aries,
          credentialFormat: AriesCredentialRegistrationFormat.Anoncreds,
          network: DidMethod.Indy,
          did: uuid(),
        } as GetSchemaRegistrationRequest)

      expect(response.status).toBe(404)
    })

    test('BadRequest.WrongSchema.ReturnNotFound', async () => {
      const userAuthToken = await UserUtilities.register(app)
      expect(userAuthToken).not.toBeUndefined()

      const response = await request(app)
        .get(`/v2/schemas/${uuid()}/registration`)
        .auth(userAuthToken!, { type: 'bearer' })
        .query({
          protocol: ProtocolType.Aries,
          credentialFormat: AriesCredentialRegistrationFormat.Anoncreds,
          network: DidMethod.Indy,
          did: uuid(),
        } as RegisterSchemaRequest)

      expect(response.status).toBe(404)
    })

    test('OKRequest.Aries.Indy.GetSchemaRegistrationDetails', async () => {
      const userAuthToken = await UserUtilities.register(app, { role: Role.Admin })
      expect(userAuthToken).not.toBeUndefined()

      const did = await DidUtilities.create(app, userAuthToken!, DidMethod.Indy)
      expect(did).toBeDefined()

      const schema = await SchemaUtilities.create(app, userAuthToken!)
      expect(schema).toBeDefined()

      await testRegister({
        schemaId: schema!.id,
        authToken: userAuthToken!,
        protocol: ProtocolType.Aries,
        credentialFormat: AriesCredentialRegistrationFormat.Anoncreds,
        network: DidMethod.Indy,
        did: did!.id,
      })

      let response = await request(app)
        .get(`/v2/schemas/${schema?.id}/registration`)
        .auth(userAuthToken!, { type: 'bearer' })
        .query({
          protocol: ProtocolType.Aries,
          credentialFormat: AriesCredentialRegistrationFormat.Anoncreds,
          network: DidMethod.Indy,
          did: did!.id,
        } as GetSchemaRegistrationRequest)

      expect(response.status).toBe(200)
      expect(response.body.registered).toBe(true)
      expect(response.body.credentials).toBeDefined()

      response = await request(app)
        .get(`/v2/schemas/${schema?.id}/registration`)
        .auth(userAuthToken!, { type: 'bearer' })
        .query({
          protocol: ProtocolType.Aries,
          credentialFormat: AriesCredentialRegistrationFormat.Anoncreds,
          network: DidMethod.Indy,
          did: did!.id,
        } as GetSchemaRegistrationRequest)

      expect(response.status).toBe(200)
      expect(response.body.registered).toBe(true)
      expect(response.body.credentials).toBeDefined()

      response = await request(app)
        .get(`/v2/schemas/${schema?.id}/registration`)
        .auth(userAuthToken!, { type: 'bearer' })
        .query({
          protocol: ProtocolType.Aries,
          credentialFormat: AriesCredentialRegistrationFormat.Anoncreds,
          network: DidMethod.IndyBesu,
          did: did!.id,
        } as GetSchemaRegistrationRequest)

      expect(response.status).toBe(200)
      expect(response.body.registered).toBe(false)
      expect(response.body.credentials).toBeUndefined()
    })

    test('OKRequest.Aries.Hedera.GetSchemaRegistrationDetails', async () => {
      const userAuthToken = await UserUtilities.register(app, { role: Role.Admin })
      expect(userAuthToken).not.toBeUndefined()

      const did = await DidUtilities.create(app, userAuthToken!, DidMethod.Hedera)
      expect(did).toBeDefined()

      const schema = await SchemaUtilities.create(app, userAuthToken!)
      expect(schema).toBeDefined()

      await testRegister({
        schemaId: schema!.id,
        authToken: userAuthToken!,
        protocol: ProtocolType.Aries,
        credentialFormat: AriesCredentialRegistrationFormat.Anoncreds,
        network: DidMethod.Hedera,
        did: did!.id,
      })

      let response = await request(app)
        .get(`/v2/schemas/${schema?.id}/registration`)
        .auth(userAuthToken!, { type: 'bearer' })
        .query({
          protocol: ProtocolType.Aries,
          credentialFormat: AriesCredentialRegistrationFormat.Anoncreds,
          network: DidMethod.Hedera,
          did: did!.id,
        } as GetSchemaRegistrationRequest)

      expect(response.status).toBe(200)
      expect(response.body.registered).toBe(true)
      expect(response.body.credentials).toBeDefined()

      response = await request(app)
        .get(`/v2/schemas/${schema?.id}/registration`)
        .auth(userAuthToken!, { type: 'bearer' })
        .query({
          protocol: ProtocolType.Aries,
          credentialFormat: AriesCredentialRegistrationFormat.Anoncreds,
          network: DidMethod.Hedera,
          did: did!.id,
        } as GetSchemaRegistrationRequest)

      expect(response.status).toBe(200)
      expect(response.body.registered).toBe(true)
      expect(response.body.credentials).toBeDefined()

      response = await request(app)
        .get(`/v2/schemas/${schema?.id}/registration`)
        .auth(userAuthToken!, { type: 'bearer' })
        .query({
          protocol: ProtocolType.Aries,
          credentialFormat: AriesCredentialRegistrationFormat.Anoncreds,
          network: DidMethod.IndyBesu,
          did: did!.id,
        } as GetSchemaRegistrationRequest)

      expect(response.status).toBe(200)
      expect(response.body.registered).toBe(false)
      expect(response.body.credentials).toBeUndefined()
    })

    test('OKRequest.Oid4vc.GetSchemaRegistrationDetails', async () => {
      const userAuthToken = await UserUtilities.register(app, { role: Role.Admin })
      expect(userAuthToken).not.toBeUndefined()

      const did = await DidUtilities.create(app, userAuthToken!, DidMethod.Key)
      expect(did).toBeDefined()

      const issuer = await OpenID4VCIssuerUtilities.create(app, userAuthToken!, {
        publicIssuerId: did?.id,
      })
      expect(issuer).toBeDefined()

      const schema = await SchemaUtilities.create(app, userAuthToken!)
      expect(schema).toBeDefined()

      await testRegister({
        schemaId: schema!.id,
        authToken: userAuthToken!,
        protocol: ProtocolType.Oid4vc,
        credentialFormat: OpenId4VCCredentialRegistrationFormat.JwtVcJson,
        network: DidMethod.Key,
        did: did!.id,
      })

      await testRegister({
        schemaId: schema!.id,
        authToken: userAuthToken!,
        protocol: ProtocolType.Oid4vc,
        credentialFormat: OpenId4VCCredentialRegistrationFormat.LdpVc,
        network: DidMethod.Key,
        did: did!.id,
      })

      let response = await request(app)
        .get(`/v2/schemas/${schema?.id}/registration`)
        .auth(userAuthToken!, { type: 'bearer' })
        .query({
          protocol: ProtocolType.Oid4vc,
          credentialFormat: OpenId4VCCredentialRegistrationFormat.JwtVcJson,
          network: DidMethod.Key,
          did: did!.id,
        } as GetSchemaRegistrationRequest)

      expect(response.status).toBe(200)
      expect(response.body.registered).toBe(true)
      expect(response.body.credentials).toBeDefined()

      response = await request(app)
        .get(`/v2/schemas/${schema?.id}/registration`)
        .auth(userAuthToken!, { type: 'bearer' })
        .query({
          protocol: ProtocolType.Oid4vc,
          credentialFormat: OpenId4VCCredentialRegistrationFormat.LdpVc,
          network: DidMethod.Key,
          did: did!.id,
        } as GetSchemaRegistrationRequest)

      expect(response.status).toBe(200)
      expect(response.body.registered).toBe(true)
      expect(response.body.credentials).toBeDefined()

      response = await request(app)
        .get(`/v2/schemas/${schema?.id}/registration`)
        .auth(userAuthToken!, { type: 'bearer' })
        .query({
          protocol: ProtocolType.Oid4vc,
          credentialFormat: OpenId4VCCredentialRegistrationFormat.JwtVcJsonLd,
          network: DidMethod.Key,
          did: did!.id,
        } as GetSchemaRegistrationRequest)

      expect(response.status).toBe(200)
      expect(response.body.registered).toBe(false)
      expect(response.body.credentials).toBeUndefined()

      response = await request(app)
        .get(`/v2/schemas/${schema?.id}/registration`)
        .auth(userAuthToken!, { type: 'bearer' })
        .query({
          protocol: ProtocolType.Oid4vc,
          credentialFormat: OpenId4VCCredentialRegistrationFormat.SdJwtVc,
          network: DidMethod.Key,
          did: did!.id,
        } as GetSchemaRegistrationRequest)

      expect(response.status).toBe(200)
      expect(response.body.registered).toBe(false)
      expect(response.body.credentials).toBeUndefined()
    })
  })
})
