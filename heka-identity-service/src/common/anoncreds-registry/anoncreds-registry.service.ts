import type {
  AnonCredsCredentialDefinition,
  AnonCredsRevocationRegistryDefinition,
  AnonCredsSchema,
} from '@credo-ts/anoncreds'

import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common'
import { ConfigType } from '@nestjs/config'

import { TenantAgent } from 'common/agent'
import AgentConfig from 'config/agent'

import { AnoncredsRegistry, CredentialDefinition, Schema } from './anoncreds-registry.types'
import { AnoncredsHederaRegistrar, AnoncredsIndyBesuRegistrar, AnoncredsIndyRegistrar } from './methods'

@Injectable()
export class AnoncredsRegistryService {
  private readonly registrars!: Record<string, AnoncredsRegistry>

  public constructor(@Inject(AgentConfig.KEY) agencyConfig: ConfigType<typeof AgentConfig>) {
    this.registrars = {}
    const ariesCredConfig = agencyConfig.credentialsConfiguration.Aries
    if (ariesCredConfig.networks.includes(AnoncredsIndyRegistrar.method)) {
      this.registrars[AnoncredsIndyRegistrar.method] = new AnoncredsIndyRegistrar(agencyConfig)
    }
    if (ariesCredConfig.networks.includes(AnoncredsIndyBesuRegistrar.method)) {
      this.registrars[AnoncredsIndyBesuRegistrar.method] = new AnoncredsIndyBesuRegistrar(agencyConfig)
    }
    if (ariesCredConfig.networks.includes(AnoncredsHederaRegistrar.method)) {
      this.registrars[AnoncredsHederaRegistrar.method] = new AnoncredsHederaRegistrar()
    }
  }

  public getAnoncredsRegistry(id: string): AnoncredsRegistry {
    const parts = id.split(':')
    if (parts.length < 2) {
      throw new BadRequestException(`Invalid anoncreds identifier '${id}'`)
    }

    const method = parts[1]
    const register = this.registrars[method]
    if (!register) {
      throw new BadRequestException(`Anoncreds Method '${method}' is not supported`)
    }
    return register
  }

  public async getSchema(
    tenantAgent: TenantAgent,
    schemaId: string,
  ): Promise<{
    schema: AnonCredsSchema
    schemaId: string
  }> {
    const schemaResolutionResult = await this.getAnoncredsRegistry(schemaId).getSchema(tenantAgent, schemaId)
    const {
      schema,
      resolutionMetadata: { error, message },
    } = schemaResolutionResult

    if (!schema) {
      switch (error) {
        case 'notFound':
          throw new NotFoundException(`Schema Not Found`)
        case 'unsupportedAnonCredsMethod':
        case 'invalid':
          throw new BadRequestException(`Unable to retreive schema with id '${schemaId}': ${error} ${message}`)
        default:
          throw new InternalServerErrorException(`Unable to retreive schema with id '${schemaId}': ${error} ${message}`)
      }
    }

    return {
      schema,
      schemaId: schemaResolutionResult.schemaId,
    }
  }

  public async registerSchema(
    tenantAgent: TenantAgent,
    schema: Schema,
  ): Promise<{
    schema: AnonCredsSchema
    schemaId: string
  }> {
    const createSchemaResult = await this.getAnoncredsRegistry(schema.issuerId).registerSchema(tenantAgent, schema)

    const { schemaState } = createSchemaResult

    if (schemaState.state !== 'finished') {
      throw new InternalServerErrorException(
        `Schema was not created: ${schemaState.state === 'failed' ? schemaState.reason : 'Not finished'}`,
      )
    }

    return {
      schema: schemaState.schema,
      schemaId: schemaState.schemaId,
    }
  }

  public async getCredentialDefinition(
    tenantAgent: TenantAgent,
    credentialDefinitionId: string,
  ): Promise<{
    credentialDefinition: AnonCredsCredentialDefinition
    credentialDefinitionId: string
  }> {
    const resolutionResult = await this.getAnoncredsRegistry(credentialDefinitionId).getCredentialDefinition(
      tenantAgent,
      credentialDefinitionId,
    )
    if (resolutionResult.resolutionMetadata.error === 'invalid') {
      throw new BadRequestException(
        `Invalid credential definition ID. Details: ${resolutionResult.resolutionMetadata.message ?? 'N/A'}`,
      )
    }

    if (resolutionResult.resolutionMetadata.error === 'unsupportedAnonCredsMethod') {
      throw new BadRequestException(
        `Unsupported credential definition ID format. Details: ${resolutionResult.resolutionMetadata.message ?? 'N/A'}`,
      )
    }

    if (resolutionResult.resolutionMetadata.error === 'notFound') {
      throw new NotFoundException('Credential definition not found')
    }

    if (resolutionResult.resolutionMetadata.error || !resolutionResult.credentialDefinition) {
      throw new InternalServerErrorException(
        `Credential definition was not resolved. Error: ${
          resolutionResult.resolutionMetadata.error ?? 'unknown'
        }. Details: ${resolutionResult.resolutionMetadata.message ?? 'N/A'}`,
      )
    }

    return {
      credentialDefinition: resolutionResult.credentialDefinition,
      credentialDefinitionId: resolutionResult.credentialDefinitionId,
    }
  }

  public async registerCredentialDefinition(
    tenantAgent: TenantAgent,
    credDef: CredentialDefinition,
  ): Promise<{
    credentialDefinition: AnonCredsCredentialDefinition
    credentialDefinitionId: string
  }> {
    const registrationResult = await this.getAnoncredsRegistry(credDef.issuerId).registerCredentialDefinition(
      tenantAgent,
      credDef,
    )
    const registrationState = registrationResult.credentialDefinitionState
    if (registrationState.state !== 'finished') {
      throw new InternalServerErrorException(
        `Credential definition was not created: ${
          registrationState.state === 'failed' ? registrationState.reason : 'Not finished'
        }`,
      )
    }
    return {
      credentialDefinition: registrationState.credentialDefinition,
      credentialDefinitionId: registrationState.credentialDefinitionId,
    }
  }

  public async registerRevocationRegistryDefinition(
    tenantAgent: TenantAgent,
    issuerId: string,
    credentialDefinitionId: string,
    maximumCredentialNumber?: number,
  ): Promise<{
    revocationRegistryDefinition: AnonCredsRevocationRegistryDefinition
    revocationRegistryDefinitionId: string
  }> {
    const registrationResult = await this.getAnoncredsRegistry(issuerId).registerRevocationRegistryDefinition(
      tenantAgent,
      issuerId,
      credentialDefinitionId,
      maximumCredentialNumber,
    )

    const registrationState = registrationResult.revocationRegistryDefinitionState
    if (registrationState.state !== 'finished') {
      throw new InternalServerErrorException(
        `Revocation registry definition was not created: ${
          registrationState.state === 'failed' ? registrationState.reason : 'Not finished'
        }`,
      )
    }
    return {
      revocationRegistryDefinitionId: registrationState.revocationRegistryDefinitionId,
      revocationRegistryDefinition: registrationState.revocationRegistryDefinition,
    }
  }
}
