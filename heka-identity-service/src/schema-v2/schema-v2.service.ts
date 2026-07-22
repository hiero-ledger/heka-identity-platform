import { OpenId4VciCredentialConfigurationSupported, OpenId4VciCredentialFormatProfile } from '@credo-ts/openid4vc'
import { EntityManager } from '@mikro-orm/core'
import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common'

import { InjectLogger, Logger } from 'common/logger'

import { TenantAgent } from '../common/agent'
import { AnoncredsRegistryService } from '../common/anoncreds-registry'
import { AuthInfo } from '../common/auth'
import { Schema, SchemaField } from '../common/entities'
import { StatusListPurpose } from '../common/entities/credential-status-list.entity'
import { SchemaRegistration } from '../common/entities/schema-registration.entity'
import { FileStorageService } from '../common/file-storage/file-storage.service'
import { OCAService } from '../common/oca/oca.service'
import {
  AriesCredentialRegistrationFormat,
  CredentialRegistrationFormat,
  DidMethod,
  OpenId4VCCredentialRegistrationFormat,
  ProtocolType,
} from '../common/types'
import { UpdateIssuerSupportedCredentialsAction } from '../openid4vc/issuer/dto/update-issuer.dto'
import { OpenId4VcIssuerService } from '../openid4vc/issuer/issuer.service'
import { RevocationRegistryService } from '../revocation/revocation-registry/revocation-registry.service'
import { StatusListService } from '../revocation/status-list/status-list.service'
import { moveElement } from '../utils/array'

import {
  CreateSchemaRequest,
  CreateSchemaResponse,
  GetSchemaResponse,
  GetSchemasListItem,
  GetSchemasListRequest,
  GetSchemasListResponse,
  PatchSchemaRequest,
  PatchSchemaResponse,
} from './dto'
import { GetSchemaRegistrationRequest, GetSchemaRegistrationResponse } from './dto/get-schema-registration'
import { RegisterSchemaRequest, RegisterSchemaResponse } from './dto/register-schema'

type OpenId4VciCredentialConfigurationSupportedWithId = OpenId4VciCredentialConfigurationSupported & { id: string }

const compareByOrderIndex = (a: { orderIndex?: number }, b: { orderIndex?: number }): number =>
  (a.orderIndex ?? 0) - (b.orderIndex ?? 0)

@Injectable()
export class SchemaV2Service {
  private LOGO_STORAGE_ROOT_PATH = 'logo'
  private OID4VC_CREDENTIALS_CONTEXT = 'https://www.w3.org/2018/credentials/v1'

  public constructor(
    @InjectLogger(SchemaV2Service)
    private readonly logger: Logger,
    private readonly em: EntityManager,
    private readonly fileStorageService: FileStorageService,
    private readonly anoncredsRegistryService: AnoncredsRegistryService,
    private readonly revocationRegistryService: RevocationRegistryService,
    private readonly statusListService: StatusListService,
    private readonly ocaService: OCAService,
    private readonly openId4VcIssuerService: OpenId4VcIssuerService,
  ) {
    this.logger.child('constructor').trace('<>')
  }

  private setLogo = async (schema: Schema, logo?: string, logoFile?: Express.Multer.File) => {
    if (!logo && !logoFile) {
      return
    }

    if (schema.logo) {
      await this.fileStorageService.remove(schema.logo)
      schema.logo = undefined
    }

    if (logoFile) {
      const logoUrl = await this.fileStorageService.put(logoFile, {
        filePath: this.LOGO_STORAGE_ROOT_PATH,
        replace: true,
      })
      schema.logo = logoUrl
    }
  }

  private setPlace = async (schema: Schema, position?: 'first' | 'last' | string) => {
    // Algorithm
    // 1. Get all list ordered by OrderIndex and Name
    // 2. Element moved in this list to required position (first, last, after another element)
    // 3. For all loaded list items changed order index (by array position)

    const owner = schema.owner

    // get prev schema
    let prevSchema: Schema | null = null

    if (position === 'first') {
      // first position
      prevSchema = null
    } else if (position === 'last') {
      // last position
      prevSchema = await this.em.findOne(
        Schema,
        { owner, isHidden: schema.isHidden },
        { orderBy: [{ orderIndex: 'desc' }] },
      )
    } else {
      // after the scheme position
      prevSchema = await this.em.findOne(Schema, { owner, id: position })
      if (!prevSchema) {
        throw new BadRequestException(`Previous schema with id ${position} not found.`)
      }
    }

    // get all schemas
    const schemas = await this.em.find(
      Schema,
      { owner, isHidden: schema.isHidden },
      { orderBy: [{ orderIndex: 'asc' }, { name: 'asc' }] },
    )

    if (schemas.length) {
      // change schema position
      const schemaIndex = schemas.indexOf(schema)
      let toIndex = 0
      if (prevSchema) {
        const prevSchemaIndex = schemas.indexOf(prevSchema)
        toIndex = prevSchemaIndex <= schemaIndex ? prevSchemaIndex + 1 : prevSchemaIndex
      }
      moveElement(schemas, schemaIndex, toIndex)
      // recalculate order indexes
      schemas.forEach((s) => {
        s.orderIndex = schemas.indexOf(s)
      })
    }
  }

  private async ariesRegister(prop: {
    tenantAgent: TenantAgent
    schema: Schema
    credentialFormat: AriesCredentialRegistrationFormat
    network?: DidMethod
    did: string
  }): Promise<SchemaRegistration> {
    const { tenantAgent, schema, credentialFormat, network, did } = prop

    if (credentialFormat === AriesCredentialRegistrationFormat.Anoncreds) {
      // register
      const result = await this.anoncredsRegistryService.registerSchema(tenantAgent, {
        issuerId: did,
        name: schema.name,
        version: '1.0.0',
        attrNames: schema.fields
          .toArray()
          .sort(compareByOrderIndex)
          .map((x) => x.name),
      })

      // register credentials
      const resultCredentials = await this.anoncredsRegistryService.registerCredentialDefinition(tenantAgent, {
        issuerId: did,
        schemaId: result.schemaId,
        tag: 'default',
      })

      // create revocation registry
      const revocationRegistry = await this.revocationRegistryService.create(prop.tenantAgent, {
        issuerId: did,
        credentialDefinitionId: resultCredentials.credentialDefinitionId,
        maximumCredentialNumber: undefined,
      })

      // save
      const schemaRegistration = new SchemaRegistration({
        protocol: ProtocolType.Aries,
        schema,
        credentialFormat: credentialFormat,
        network,
        did,
        credentials: {
          credentialDefinitionId: resultCredentials.credentialDefinitionId,
          revocationRegistryDefinitionId: revocationRegistry.revocationRegistryDefinitionId,
        },
      })
      this.em.persist(schemaRegistration)
      await this.em.flush()

      // update OCA files for Aries registrations
      // TODO: it will be good if will update OCA files for changed schema only.
      this.ocaService.refreshOCAFiles()

      // return registrations data
      return schemaRegistration
    }

    throw new BadRequestException(`Unsupported credential format ${credentialFormat}`)
  }

  private makeCredentialSubject = (schema: Schema) =>
    Object.assign(
      {},
      ...schema.fields
        .toArray()
        .sort(compareByOrderIndex)
        .map((x) => ({ [x.name]: {} })),
    )

  private makeCredentialDisplay = (schema: Schema) => [
    {
      name: schema.name,
      logo: {
        url: schema.logo ? this.fileStorageService.url(schema.logo) : undefined,
      },
      background_color: schema.bgColor,
    },
  ]

  private makeSdJwtCredentialDefinition = (
    supportedCredentialId: string,
    schema: Schema,
  ): OpenId4VciCredentialConfigurationSupportedWithId => ({
    format: OpenId4VciCredentialFormatProfile.SdJwtVc,
    id: supportedCredentialId,
    vct: schema.name,
    cryptographic_binding_methods_supported: ['jwk', 'did:jwk', 'did:key'],
    claims: this.makeCredentialSubject(schema),
    display: this.makeCredentialDisplay(schema),
  })

  private makeJwtJsonCredentialDefinition = (
    supportedCredentialId: string,
    schema: Schema,
  ): OpenId4VciCredentialConfigurationSupportedWithId => ({
    format: OpenId4VciCredentialFormatProfile.JwtVcJson,
    id: supportedCredentialId,
    cryptographic_binding_methods_supported: ['did:jwk', 'did:key'],
    credential_definition: {
      type: ['VerifiableCredential', `${schema.name}`],
      credentialSubject: this.makeCredentialSubject(schema),
    },
    display: this.makeCredentialDisplay(schema),
  })

  private makeJwtJsonLdCredentialDefinition = (
    supportedCredentialId: string,
    schema: Schema,
  ): OpenId4VciCredentialConfigurationSupportedWithId => ({
    format: OpenId4VciCredentialFormatProfile.JwtVcJsonLd,
    id: supportedCredentialId,
    cryptographic_binding_methods_supported: ['did:jwk', 'did:key'],
    credential_definition: {
      type: ['VerifiableCredential', `${schema.name}`],
      '@context': [this.OID4VC_CREDENTIALS_CONTEXT],
      credentialSubject: this.makeCredentialSubject(schema),
    },
    display: this.makeCredentialDisplay(schema),
  })

  private makeLdpVcCredentialDefinition = (
    supportedCredentialId: string,
    schema: Schema,
  ): OpenId4VciCredentialConfigurationSupportedWithId => ({
    format: OpenId4VciCredentialFormatProfile.LdpVc,
    id: supportedCredentialId,
    cryptographic_binding_methods_supported: ['did:jwk', 'did:key'],
    credential_definition: {
      type: ['VerifiableCredential', `${schema.name}`],
      '@context': [this.OID4VC_CREDENTIALS_CONTEXT],
      credentialSubject: this.makeCredentialSubject(schema),
    },
    display: this.makeCredentialDisplay(schema),
  })

  private makeMsoMdocCredentialDefinition = (
    supportedCredentialId: string,
    schema: Schema,
  ): OpenId4VciCredentialConfigurationSupportedWithId => ({
    format: OpenId4VciCredentialFormatProfile.MsoMdoc,
    id: supportedCredentialId,
    doctype: schema.name,
    cryptographic_binding_methods_supported: ['cose_key'],
    claims: schema.fields
      .toArray()
      .sort(compareByOrderIndex)
      .map((field) => ({ path: [schema.name, field.name] as [string, string] })),
    display: this.makeCredentialDisplay(schema),
  })

  private async oid4vcRegister(prop: {
    tenantAgent: TenantAgent
    authInfo: AuthInfo
    schema: Schema
    credentialFormat: OpenId4VCCredentialRegistrationFormat
    network?: DidMethod
    did: string
  }): Promise<SchemaRegistration> {
    const { tenantAgent, schema, credentialFormat, network, did } = prop

    const issuer = await tenantAgent.openid4vc.issuer.getIssuerByIssuerId(did)

    const supportedCredentialId = `${schema.name}:${network}:${credentialFormat}`

    if (issuer.credentialConfigurationsSupported[supportedCredentialId]) {
      throw new BadRequestException(`Schema "${schema.name}" already registered for ${credentialFormat}:${network}`)
    }

    // make credential definition
    let credential: OpenId4VciCredentialConfigurationSupportedWithId | undefined
    switch (credentialFormat) {
      case OpenId4VCCredentialRegistrationFormat.SdJwtVc:
        credential = this.makeSdJwtCredentialDefinition(supportedCredentialId, schema)
        break
      case OpenId4VCCredentialRegistrationFormat.JwtVcJson:
        credential = this.makeJwtJsonCredentialDefinition(supportedCredentialId, schema)
        break
      case OpenId4VCCredentialRegistrationFormat.JwtVcJsonLd:
        credential = this.makeJwtJsonLdCredentialDefinition(supportedCredentialId, schema)
        break
      case OpenId4VCCredentialRegistrationFormat.LdpVc:
        credential = this.makeLdpVcCredentialDefinition(supportedCredentialId, schema)
        break
      case OpenId4VCCredentialRegistrationFormat.MsoMdoc:
        credential = this.makeMsoMdocCredentialDefinition(supportedCredentialId, schema)
        break
      default:
        credential = undefined
    }
    if (!credential) {
      throw new InternalServerErrorException(`Failed to generate CredentialDefinition`)
    }

    // update metadata via the wrapper service so proof_types_supported defaults are applied
    // TODO: Fix typechecks — credo's union type doesn't line up with the wrapper DTO's discriminated union
    await this.openId4VcIssuerService.updateIssuerMetadata(tenantAgent, issuer.issuerId, {
      action: UpdateIssuerSupportedCredentialsAction.Add,
      credentialsSupported: [credential] as any,
    })

    // create revocation status list
    const revocationStatusList = await this.statusListService.create(prop.authInfo, {
      issuer: did,
      purpose: StatusListPurpose.Revocation,
    })

    // save
    const schemaRegistration = new SchemaRegistration({
      protocol: ProtocolType.Oid4vc,
      schema,
      credentialFormat: credentialFormat,
      network,
      did,
      credentials: {
        supportedCredentialId,
        statusListId: revocationStatusList.id,
      },
    })
    this.em.persist(schemaRegistration)
    await this.em.flush()
    return schemaRegistration
  }

  private async oid4vcUpdateSchemaDisplay(prop: { tenantAgent: TenantAgent; schema: Schema; did: string }) {
    const { tenantAgent, schema, did } = prop

    const issuer = await tenantAgent.openid4vc.issuer.getIssuerByIssuerId(did)

    const display = {
      name: schema.name,
      logo: {
        url: schema.logo ? this.fileStorageService.url(schema.logo) : undefined,
      },
      background_color: schema.bgColor,
    }

    const credentialsSupported = Object.entries(issuer.credentialConfigurationsSupported).map(
      ([configurationId, credentialConfiguration]) => ({
        ...(credentialConfiguration as Record<string, unknown>),
        id: configurationId,
        display: [display],
      }),
    )

    // update metadata via the wrapper service so proof_types_supported defaults are (re)applied
    // TODO: Fix typechecks — credo's union type doesn't line up with the wrapper DTO's discriminated union
    await this.openId4VcIssuerService.updateIssuerMetadata(tenantAgent, issuer.issuerId, {
      action: UpdateIssuerSupportedCredentialsAction.Replace,
      credentialsSupported: credentialsSupported as any,
      display: issuer.display,
    })
  }

  private getSchemaRegistration = async (
    schema: Schema,
    props: {
      protocol: ProtocolType
      credentialFormat?: CredentialRegistrationFormat | undefined
      network?: DidMethod | undefined
      did: string
    },
  ): Promise<SchemaRegistration | null> => {
    return await this.em.findOne(SchemaRegistration, {
      schema,
      protocol: props.protocol,
      credentialFormat: props.credentialFormat,
      network: props.network,
      did: props.did,
    })
  }

  public getList = async (authInfo: AuthInfo, request: GetSchemasListRequest): Promise<GetSchemasListResponse> => {
    const logger = this.logger.child('getList')
    logger.trace('>')

    const conditions = []

    conditions.push({ owner: authInfo.user })

    if (request.text) {
      conditions.push({ name: { $like: `%${request.text}%` } })
    }

    if (request.isHidden !== undefined) {
      conditions.push({ isHidden: request.isHidden })
    }

    const filter: any = {}
    if (conditions.length > 0) {
      filter.$or = [conditions.length > 1 ? { $and: conditions } : conditions[0]]
    }

    const [items, total] = await this.em.findAndCount(Schema, filter, {
      fields: ['id', 'name', 'logo', 'bgColor', 'isHidden', 'orderIndex', 'owner', 'fields', 'registrations'],
      populate: ['fields', 'registrations'],
      offset: request.offset,
      limit: request.limit,
      orderBy: [{ orderIndex: 'asc' }, { name: 'asc' }],
    })

    const result = new GetSchemasListResponse({
      total,
      offset: request.offset,
      limit: request.limit,
      items: items.map<GetSchemasListItem>((item) => ({
        id: item.id,
        issuerId: item.owner.id,
        issuerName: item.owner.name,
        name: item.name,
        logo: item.logo ? this.fileStorageService.url(item.logo) : undefined,
        bgColor: item.bgColor,
        isHidden: item.isHidden,
        orderIndex: item.orderIndex,
        registrationsCount: item.registrations.count(),
        fields: item.fields
          .toArray()
          .sort(compareByOrderIndex)
          .map((f) => ({
            id: f.id,
            name: f.name,
          })),
        registrations: item.registrations.map((r) => ({
          protocol: r.protocol,
          credentialFormat: r.credentialFormat,
          network: r.network,
          did: r.did,
          credentials: r.credentials,
        })),
      })),
    })

    logger.trace('<')
    return result
  }

  public getById = async (authInfo: AuthInfo, id: string): Promise<GetSchemaResponse> => {
    const logger = this.logger.child('getById')
    logger.trace('>')

    const owner = authInfo.user

    const schema = await this.em.findOne(Schema, { owner, id }, { populate: ['owner', 'fields', 'registrations'] })
    if (!schema) {
      throw new NotFoundException(`Schema with id ${id} not found.`)
    }

    const result = new GetSchemaResponse({
      id: schema.id,
      issuerId: schema.owner.id,
      issuerName: schema.owner.name,
      name: schema.name,
      logo: schema.logo ? this.fileStorageService.url(schema.logo) : undefined,
      bgColor: schema.bgColor,
      isHidden: schema.isHidden,
      orderIndex: schema.orderIndex,
      fields: schema.fields
        .toArray()
        .sort(compareByOrderIndex)
        .map((f) => ({
          id: f.id,
          name: f.name,
        })),
      registrations: schema.registrations.map((r) => ({
        protocol: r.protocol,
        credentialFormat: r.credentialFormat,
        network: r.network,
        did: r.did,
        credentials: r.credentials,
      })),
      registrationsCount: schema.registrations.count(),
    })

    logger.trace('<')
    return result
  }

  public create = async (
    authInfo: AuthInfo,
    request: CreateSchemaRequest,
    logoFile?: Express.Multer.File,
  ): Promise<CreateSchemaResponse> => {
    const logger = this.logger.child('create')
    logger.trace('>')

    const owner = authInfo.user

    // check unique
    if (await this.em.findOne(Schema, { owner, name: { $eq: request.name } })) {
      throw new BadRequestException(`Schema with name ${request.name} already exists.`)
    }

    // last schema
    const lastSchema = await this.em.findOne(Schema, { owner, isHidden: false }, { orderBy: [{ orderIndex: 'desc' }] })

    // create schema
    const newSchema = new Schema({
      owner,
      bgColor: request.bgColor,
      isHidden: false,
      name: request.name,
      orderIndex: (lastSchema?.orderIndex ?? -1) + 1,
    })

    await this.setLogo(newSchema, request.logo, logoFile)

    await this.setPlace(newSchema, 'last')

    request.fields.forEach((f) => {
      newSchema.fields.add(
        new SchemaField({
          name: f,
          orderIndex: request.fields.indexOf(f),
        }),
      )
    })

    this.em.persist(newSchema)
    await this.em.flush()

    // result
    logger.trace('<')
    return await this.getById(authInfo, newSchema.id)
  }

  public patch = async (
    authInfo: AuthInfo,
    tenantAgent: TenantAgent,
    id: string,
    request: PatchSchemaRequest,
    logoFile: Express.Multer.File,
  ): Promise<PatchSchemaResponse> => {
    const logger = this.logger.child('patch')
    logger.trace('>')

    const owner = authInfo.user

    const schema = await this.em.findOne(Schema, { owner, id }, { populate: ['owner', 'registrations'] })
    if (!schema) {
      throw new NotFoundException(`Schema with id ${id} not found.`)
    }

    // patch the schema

    // hidden flag
    if (request.isHidden !== undefined) {
      schema.isHidden = request.isHidden
      await this.setPlace(schema, 'last')
    }

    // logo
    await this.setLogo(schema, request.logo, logoFile)

    // bgColor
    if (request.bgColor) {
      schema.bgColor = request.bgColor
    }

    // position
    if (request.previousSchemaId !== undefined) {
      await this.setPlace(schema, request.previousSchemaId ? request.previousSchemaId : 'first')
    }

    // update schema display if bgColor or Logo were changed
    if (request.bgColor || logoFile) {
      const registrationsForUpdate = schema.registrations.filter((r) => r.protocol === ProtocolType.Oid4vc)
      for (const registrationsForUpdateItem of registrationsForUpdate) {
        await this.oid4vcUpdateSchemaDisplay({ tenantAgent, schema, did: registrationsForUpdateItem.did })
      }
    }

    // save
    await this.em.flush()

    // update OCA files for Aries registrations if exists
    // TODO: it will be good if will update OCA files for changed schema only.
    this.ocaService.refreshOCAFiles()

    logger.trace('<')
    return await this.getById(authInfo, schema.id)
  }

  public registration = async (
    authInfo: AuthInfo,
    tenantAgent: TenantAgent,
    schemaId: string,
    request: RegisterSchemaRequest,
  ): Promise<RegisterSchemaResponse> => {
    const logger = this.logger.child('register')
    logger.trace('>')

    // get owner
    const owner = authInfo.user

    // get schema
    const schema = await this.em.findOne(Schema, { owner, id: schemaId }, { populate: ['owner', 'fields'] })
    if (!schema) {
      throw new NotFoundException(`Schema with id ${schemaId} not found.`)
    }

    // check existed registration
    if (await this.getSchemaRegistration(schema, { ...request })) {
      throw new BadRequestException(`Schema is already registered here`)
    }

    let schemaRegistration: SchemaRegistration
    switch (request.protocol) {
      case ProtocolType.Aries:
        schemaRegistration = await this.ariesRegister({
          tenantAgent,
          schema,
          credentialFormat: request.credentialFormat as AriesCredentialRegistrationFormat,
          network: request.network,
          did: request.did,
        })
        break
      case ProtocolType.Oid4vc:
        schemaRegistration = await this.oid4vcRegister({
          tenantAgent,
          authInfo,
          schema,
          credentialFormat: request.credentialFormat as OpenId4VCCredentialRegistrationFormat,
          network: request.network,
          did: request.did,
        })
        break
      default:
        throw new BadRequestException('Unsupported protocol')
    }

    const result = { credentials: schemaRegistration.credentials } as RegisterSchemaResponse

    logger.trace('<')
    return result
  }

  public getRegistration = async (
    authInfo: AuthInfo,
    schemaId: string,
    request: GetSchemaRegistrationRequest,
  ): Promise<GetSchemaRegistrationResponse> => {
    const logger = this.logger.child('checkRegistration')
    logger.trace('>')

    // get owner
    const owner = authInfo.user

    // get schema
    const schema = await this.em.findOne(Schema, { owner, id: schemaId })
    if (!schema) {
      throw new NotFoundException(`Schema with id ${schemaId} not found.`)
    }

    const registration = await this.getSchemaRegistration(schema, { ...request })

    logger.trace('<')
    return { registered: registration !== null, credentials: registration?.credentials }
  }
}
