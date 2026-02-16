import { Server } from 'net'

import { MikroORM } from '@mikro-orm/core'
import { PostgreSqlDriver } from '@mikro-orm/postgresql'
import request from 'supertest'

import { Schema } from 'common/entities'
import { SchemaRegistration } from 'common/entities/schema-registration.entity'
import {
  CreateSchemaRequest,
  CreateSchemaResponse,
  GetSchemaResponse,
  GetSchemasListRequest,
  GetSchemasListResponse,
} from 'schema-v2/dto'
import { RegisterSchemaRequest } from 'schema-v2/dto/register-schema'
import { uuid } from 'utils/misc'

export class SchemaUtilities {
  public static makeCreateSchemaRequest = (req?: Partial<CreateSchemaRequest>): CreateSchemaRequest => ({
    name: req?.name ?? uuid(),
    bgColor: req?.bgColor ?? undefined,
    logo: req?.logo ?? undefined,
    fields: req?.fields ?? [uuid(), uuid(), uuid()],
  })

  public static async create(
    app: Server,
    authToken: string,
    schemaRequest?: Partial<CreateSchemaRequest>,
  ): Promise<CreateSchemaResponse | undefined> {
    const schema = this.makeCreateSchemaRequest(schemaRequest)
    const response = await request(app)
      .post('/v2/schemas')
      .auth(authToken, { type: 'bearer' })
      .set('Content-Type', 'multipart/form-data')
      .field('name', schema.name)
      .field('fields', schema.fields)
    if (response.status === 201) {
      return { ...response.body } as CreateSchemaResponse
    } else {
      return undefined
    }
  }

  public static async setHidden(app: Server, authToken: string, schemaId: string, hidden: boolean): Promise<boolean> {
    const response = await request(app)
      .patch(`/v2/schemas/${schemaId}`)
      .auth(authToken, { type: 'bearer' })
      .set('Content-Type', 'multipart/form-data')
      .field('isHidden', hidden)

    return response.status === 200
  }

  public static async get(app: Server, authToken: string, id: string): Promise<GetSchemaResponse> {
    const response = await request(app).get(`/v2/schemas/${id}`).auth(authToken, { type: 'bearer' })
    return { ...response.body } as GetSchemaResponse
  }

  public static async getList(
    app: Server,
    authToken: string,
    query: GetSchemasListRequest = {},
  ): Promise<GetSchemasListResponse> {
    const response = await request(app).get(`/v2/schemas`).auth(authToken, { type: 'bearer' }).query(query)
    return { ...response.body } as GetSchemasListResponse
  }

  public static async register(
    app: Server,
    authToken: string,
    schemaId: string,
    req: RegisterSchemaRequest,
  ): Promise<boolean> {
    const response = await request(app)
      .post(`/v2/schemas/${schemaId}/registration`)
      .auth(authToken, { type: 'bearer' })
      .send({ ...req })

    return response.status === 201
  }

  public static async fakeRegister(
    orm: MikroORM<PostgreSqlDriver>,
    schemaId: string,
    registerRequest?: Partial<RegisterSchemaRequest>,
  ): Promise<boolean> {
    const em = orm.em.fork()

    const schema = await em.findOneOrFail(Schema, { id: schemaId })
    if (!schema) return false

    await em.insert(SchemaRegistration, {
      id: uuid(),
      protocol: registerRequest?.protocol,
      credentialFormat: registerRequest?.credentialFormat,
      network: registerRequest?.network,
      did: registerRequest?.did,
      schema: schema,
      credentials: undefined,
    } as SchemaRegistration)

    await em.flush()

    return true
  }
}
