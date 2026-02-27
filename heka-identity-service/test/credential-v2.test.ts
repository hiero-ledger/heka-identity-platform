import { Server } from 'net'

import { DidCommCredentialState, DidCommProofState } from '@credo-ts/didcomm'
import { OpenId4VcIssuanceSessionState, OpenId4VcVerificationSessionState } from '@credo-ts/openid4vc'
import { MikroORM } from '@mikro-orm/core'
import { PostgreSqlDriver } from '@mikro-orm/postgresql'
import { SchemaGenerator } from '@mikro-orm/sqlite'
import { INestApplication } from '@nestjs/common'
import request, { WSChain } from 'superwstest'

import { Role } from 'common/auth'
import {
  AriesCredentialFormat,
  credentialFormatToCredentialRegistrationFormat,
  DidMethod,
  OpenId4VcCredentialFormat,
  ProtocolType,
} from 'common/types'
import { ProofByVerificationTemplateRequest } from 'credential-v2/dto/proof-by-template'
import { CreateIssuanceTemplateResponse } from 'issuance-template/dto'
import { CreateSchemaResponse } from 'schema-v2/dto'
import { RegisterSchemaRequest } from 'schema-v2/dto/register-schema'
import { sleep } from 'src/utils/timers'
import { CredentialV2Utilities } from 'test/helpers/credential-v2'
import { DidUtilities } from 'test/helpers/did'
import { IssuanceTemplateUtilities } from 'test/helpers/issuance-template'
import { VerificationTemplateUtilities } from 'test/helpers/verification-template'
import { uuid } from 'utils/misc'
import { CreateVerificationTemplateResponse } from 'verification-template/dto'

import {
  connectUsers,
  initializeMikroOrm,
  credentialRegistrationFormatToCredentialFormat,
  SchemaUtilities,
  startTestApp,
  UserUtilities,
} from './helpers'

describe('Credential V2 tests', () => {
  let ormSchemaGenerator: SchemaGenerator

  let nestApp: INestApplication
  let app: Server
  let orm: MikroORM<PostgreSqlDriver>
  let verifier: WSChain
  let holderWebSocket: WSChain

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
    await nestApp.close()
  })

  const prepareSchemaAndIssuanceTemplate = async (
    token: string,
    req: RegisterSchemaRequest,
    registerSchema = true,
  ): Promise<[CreateSchemaResponse, CreateIssuanceTemplateResponse]> => {
    const schema = await SchemaUtilities.create(app, token, {
      name: 'Test',
      bgColor: '#171717',
      fields: ['f1', 'f2'],
    })
    expect(schema).toBeDefined()
    if (registerSchema) {
      const register = await SchemaUtilities.register(app, token, schema!.id, req)
      expect(register).toBeTruthy()
    }
    const template = await IssuanceTemplateUtilities.create(app, token, {
      name: 'Test Template',
      did: req.did,
      protocol: req.protocol,
      credentialFormat: credentialRegistrationFormatToCredentialFormat(req.credentialFormat),
      network: req.network,
      schemaId: schema!.id,
      fields: [
        {
          schemaFieldId: schema!.fields.find((f) => f.name === 'f1')!.id,
          value: 'v1',
        },
        {
          schemaFieldId: schema!.fields.find((f) => f.name === 'f2')!.id,
          value: 'v2',
        },
      ],
    })
    expect(template).toBeDefined()
    return [schema!, template!]
  }

  const prepareSchemaAndVerificationTemplate = async (
    token: string,
    req: RegisterSchemaRequest,
    registerSchema = true,
  ): Promise<[CreateSchemaResponse, CreateVerificationTemplateResponse]> => {
    const schema = await SchemaUtilities.create(app, token, {
      name: 'Test',
      bgColor: '#171717',
      fields: ['f1', 'f2'],
    })
    expect(schema).toBeDefined()
    if (registerSchema) {
      const register = await SchemaUtilities.register(app, token, schema!.id, req)
      expect(register).toBeTruthy()
    }
    const template = await VerificationTemplateUtilities.create(app, token, {
      name: 'Test Template',
      did: req.did,
      protocol: req.protocol,
      credentialFormat: credentialRegistrationFormatToCredentialFormat(req.credentialFormat),
      network: req.network,
      schemaId: schema!.id,
      fields: schema!.fields.map((f) => ({ schemaFieldId: f.id })),
    })
    expect(template).toBeDefined()
    return [schema!, template!]
  }

  describe('Issuance Template Tests', () => {
    test('UnauthorizedRequest.ReturnUnauthorized', async () => {
      const response = await request(app).post('/v2/credentials/offer-by-template')
      expect(response.status).toBe(401)
    })

    test('Request with bad ID should fail', async () => {
      const token = await UserUtilities.register(app, { role: Role.Admin })
      expect(token).toBeDefined()
      const templateId = uuid()
      const response = await request(app)
        .post('/v2/credentials/offer-by-template')
        .auth(token!, { type: 'bearer' })
        .send({
          templateId,
        })
      expect(response.status).toBe(404)
      expect(response.body.message).toContain(`Template with id ${templateId} not found.`)
    })

    test('Test OpenId4VC issuance by template', async () => {
      const token = await UserUtilities.register(app, { role: Role.Admin })
      expect(token).toBeDefined()
      const did = await UserUtilities.prepareWallet(app, token!)
      expect(did).toBeDefined()

      const [_schema, template] = await prepareSchemaAndIssuanceTemplate(token!, {
        did: did!,
        protocol: ProtocolType.Oid4vc,
        credentialFormat: credentialFormatToCredentialRegistrationFormat(OpenId4VcCredentialFormat.SdJwtVc),
        network: DidMethod.Key,
      })

      expect(template).toBeDefined()
      const offer = await CredentialV2Utilities.issueByTemplate(app, token!, {
        templateId: template.id,
        connectionId: undefined,
        credentials: [
          {
            name: 'f1',
            value: 'ABC',
          },
          {
            name: 'f2',
            value: 'DDD',
          },
        ],
      })
      expect(offer).toBeDefined()
      expect(offer!.offer).toContain('openid-credential-offer://')
      expect(offer!.state).toEqual(OpenId4VcIssuanceSessionState.OfferCreated)
      expect(offer?.id).toBeDefined()
    })

    test('Test Aries issuance by template', async () => {
      const issuerToken = await UserUtilities.register(app, { role: Role.Admin })
      const holderToken = await UserUtilities.register(app, { role: Role.Admin })
      expect(issuerToken).toBeDefined()

      verifier = request(app)
        .ws('/notifications')
        .set('Authorization', `Bearer ${issuerToken!}`)
        .expectUpgrade((upgradeResponse) => {}) // eslint-disable-line @typescript-eslint/no-empty-function

      await verifier
      // TODO: Find a way to explicitly await the required condition
      // Give NotificationGateway some time to register user and wallet
      await sleep(200)

      holderWebSocket = request(app)
        .ws('/notifications')
        .set('Authorization', `Bearer ${holderToken!}`)
        .expectUpgrade((upgradeResponse) => {}) // eslint-disable-line @typescript-eslint/no-empty-function

      await holderWebSocket
      // TODO: Find a way to explicitly await the required condition
      // Give NotificationGateway some time to register user and wallet
      await sleep(200)

      const did = await DidUtilities.create(app, issuerToken!, DidMethod.Indy)

      const [issuerConnectionRecordId, _holderConnectionRecordId] = await connectUsers(
        app,
        {
          label: 'Issuer',
          authToken: issuerToken!,
          webSocket: verifier,
        },
        {
          label: 'Holder',
          authToken: holderToken!,
          webSocket: holderWebSocket,
        },
      )

      expect(did).toBeDefined()
      const [_schema, template] = await prepareSchemaAndIssuanceTemplate(issuerToken!, {
        did: did!.id,
        protocol: ProtocolType.Aries,
        credentialFormat: credentialFormatToCredentialRegistrationFormat(AriesCredentialFormat.AnoncredsIndy),
        network: DidMethod.Indy,
      })
      const offer = await CredentialV2Utilities.issueByTemplate(app, issuerToken!, {
        templateId: template.id,
        connectionId: issuerConnectionRecordId,
        credentials: [
          {
            name: 'f1',
            value: 'ABC',
          },
          {
            name: 'f2',
            value: 'DDD',
          },
        ],
      })
      expect(offer).toBeDefined()
      expect(offer!.offer).toBeUndefined()
      expect(offer!.state).toEqual(DidCommCredentialState.OfferSent)
      expect(offer?.id).toBeDefined()

      await verifier.close().expectClosed()
      await holderWebSocket.close().expectClosed()
      // TODO: Find a way to explicitly await the required condition
      // Give AFJ event listeners some time to process pending events
      await sleep(4000)
    })

    test('Test Aries issuance by template without connection - should fail', async () => {
      const issuerToken = await UserUtilities.register(app, { role: Role.Admin })
      expect(issuerToken).toBeDefined()

      const did = await DidUtilities.create(app, issuerToken!, DidMethod.Indy)

      expect(did).toBeDefined()
      const [_schema, template] = await prepareSchemaAndIssuanceTemplate(issuerToken!, {
        did: did!.id,
        protocol: ProtocolType.Aries,
        credentialFormat: credentialFormatToCredentialRegistrationFormat(AriesCredentialFormat.AnoncredsIndy),
        network: DidMethod.Indy,
      })
      const req = {
        templateId: template.id,
        connectionId: undefined,
        credentials: [
          {
            name: 'f1',
            value: 'ABC',
          },
          {
            name: 'f2',
            value: 'DDD',
          },
        ],
      }
      const response = await request(app)
        .post('/v2/credentials/offer-by-template')
        .auth(issuerToken!, { type: 'bearer' })
        .send(req)
      expect(response.status).toBe(422)
      expect(response.body.message).toContain('Connection ID must me specified for Aries protocol')
    })
  })

  describe('Verification Template Tests', () => {
    test('UnauthorizedRequest.ReturnUnauthorized', async () => {
      const response = await request(app).post('/v2/credentials/proof-by-template')
      expect(response.status).toBe(401)
    })

    test('Request with bad ID should fail', async () => {
      const token = await UserUtilities.register(app, { role: Role.Admin })
      expect(token).toBeDefined()
      const templateId = uuid()
      const response = await request(app)
        .post('/v2/credentials/proof-by-template')
        .auth(token!, { type: 'bearer' })
        .send({
          templateId,
          fields: ['aaa'],
        } as ProofByVerificationTemplateRequest)
      expect(response.status).toBe(404)
      expect(response.body.message).toContain(`Template with id ${templateId} not found.`)
    })

    test('Test OpenId4VC verification by template', async () => {
      const token = await UserUtilities.register(app, { role: Role.Admin })
      expect(token).toBeDefined()
      const did = await UserUtilities.prepareWallet(app, token!)
      expect(did).toBeDefined()
      const [_schema, template] = await prepareSchemaAndVerificationTemplate(token!, {
        did: did!,
        protocol: ProtocolType.Oid4vc,
        credentialFormat: credentialFormatToCredentialRegistrationFormat(OpenId4VcCredentialFormat.SdJwtVc),
        network: DidMethod.Key,
      })

      const proof = await CredentialV2Utilities.proofByTemplate(app, token!, {
        templateId: template.id,
        connectionId: undefined,
        fields: ['f1', 'f2'],
      })
      expect(proof).toBeDefined()
      expect(proof?.id).toBeDefined()
      expect(proof?.state).toBe(OpenId4VcVerificationSessionState.RequestCreated)
      expect(proof?.request).toContain('openid4vp://?client_id=')
      expect(proof?.request).toContain('request_uri=')
    })

    test('Test Aries verification by template', async () => {
      const verifierToken = await UserUtilities.register(app, { role: Role.Admin })
      const holderToken = await UserUtilities.register(app, { role: Role.Admin })
      expect(verifierToken).toBeDefined()

      verifier = request(app)
        .ws('/notifications')
        .set('Authorization', `Bearer ${verifierToken!}`)
        .expectUpgrade((upgradeResponse) => {}) // eslint-disable-line @typescript-eslint/no-empty-function

      await verifier
      // TODO: Find a way to explicitly await the required condition
      // Give NotificationGateway some time to register user and wallet
      await sleep(200)

      holderWebSocket = request(app)
        .ws('/notifications')
        .set('Authorization', `Bearer ${holderToken!}`)
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        .expectUpgrade((upgradeResponse) => {})

      await holderWebSocket
      // TODO: Find a way to explicitly await the required condition
      // Give NotificationGateway some time to register user and wallet
      await sleep(200)

      const did = await DidUtilities.create(app, verifierToken!, DidMethod.Indy)

      const [verifierConnectionRecordId, _holderConnectionRecordId] = await connectUsers(
        app,
        {
          label: 'Verifier',
          authToken: verifierToken!,
          webSocket: verifier,
        },
        {
          label: 'Holder',
          authToken: holderToken!,
          webSocket: holderWebSocket,
        },
      )

      expect(did).toBeDefined()
      const [_schema, template] = await prepareSchemaAndVerificationTemplate(verifierToken!, {
        did: did!.id,
        protocol: ProtocolType.Aries,
        credentialFormat: credentialFormatToCredentialRegistrationFormat(AriesCredentialFormat.AnoncredsIndy),
        network: DidMethod.Indy,
      })
      const proof = await CredentialV2Utilities.proofByTemplate(app, verifierToken!, {
        templateId: template.id,
        connectionId: verifierConnectionRecordId,
        fields: ['f1', 'f2'],
      })
      expect(proof).toBeDefined()
      expect(proof?.id).toBeDefined()
      expect(proof?.request).toBeUndefined()
      expect(proof?.state).toEqual(DidCommProofState.RequestSent)

      await verifier.close().expectClosed()
      await holderWebSocket.close().expectClosed()
      // TODO: Find a way to explicitly await the required condition
      // Give AFJ event listeners some time to process pending events
      await sleep(4000)
    })

    test('Test Aries verification by template without connection - should fail', async () => {
      const verifierToken = await UserUtilities.register(app, { role: Role.Admin })
      expect(verifierToken).toBeDefined()

      const did = await DidUtilities.create(app, verifierToken!, DidMethod.Indy)

      expect(did).toBeDefined()
      const [_schema, template] = await prepareSchemaAndVerificationTemplate(verifierToken!, {
        did: did!.id,
        protocol: ProtocolType.Aries,
        credentialFormat: credentialFormatToCredentialRegistrationFormat(AriesCredentialFormat.AnoncredsIndy),
        network: DidMethod.Indy,
      })
      const response = await request(app)
        .post('/v2/credentials/proof-by-template')
        .auth(verifierToken!, { type: 'bearer' })
        .send({
          templateId: template.id,
          connectionId: undefined,
          fields: ['f1', 'f2'],
        })
      expect(response.status).toBe(422)
      expect(response.body.message).toContain('Connection ID must me specified for Aries protocol')
    })
  })
})
