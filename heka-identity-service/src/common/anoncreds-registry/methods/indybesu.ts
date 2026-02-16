import {
  GetCredentialDefinitionReturn,
  GetSchemaReturn,
  RegisterCredentialDefinitionReturn,
  RegisterRevocationRegistryDefinitionReturn,
  RegisterSchemaReturn,
} from '@credo-ts/anoncreds'
import { ConfigType } from '@nestjs/config'

import AgentConfig from '../../../config/agent'
import { TenantAgent } from '../../agent'
import { AnoncredsRegistry, CredentialDefinition, Schema } from '../anoncreds-registry.types'

export class AnoncredsIndyBesuRegistrar extends AnoncredsRegistry {
  public static readonly method = 'indybesu'

  private readonly endorserPublicKey!: string

  public constructor(agencyConfig: ConfigType<typeof AgentConfig>) {
    super()
    this.endorserPublicKey = agencyConfig.indyBesuEndorserPublicKey
  }

  public getSchema(tenantAgent: TenantAgent, schemaId: string): Promise<GetSchemaReturn> {
    return tenantAgent.modules.anoncreds.getSchema(schemaId)
  }

  public registerSchema(tenantAgent: TenantAgent, schema: Schema): Promise<RegisterSchemaReturn> {
    return tenantAgent.modules.anoncreds.registerSchema({
      schema,
      options: {
        issuerId: schema.issuerId,
        endorserKey: this.endorserPublicKey,
      },
    })
  }

  public getCredentialDefinition(
    tenantAgent: TenantAgent,
    credentialDefinitionId: string,
  ): Promise<GetCredentialDefinitionReturn> {
    return tenantAgent.modules.anoncreds.getCredentialDefinition(credentialDefinitionId)
  }

  public registerCredentialDefinition(
    tenantAgent: TenantAgent,
    credDef: CredentialDefinition,
  ): Promise<RegisterCredentialDefinitionReturn> {
    return tenantAgent.modules.anoncreds.registerCredentialDefinition({
      credentialDefinition: credDef,
      options: {
        supportRevocation: true,
        issuerId: credDef.issuerId,
        endorserKey: this.endorserPublicKey,
      },
    })
  }

  public registerRevocationRegistryDefinition(
    tenantAgent: TenantAgent,
    issuerId: string,
    credentialDefinitionId: string,
    maximumCredentialNumber?: number | undefined,
  ): Promise<RegisterRevocationRegistryDefinitionReturn> {
    throw new Error('Method not implemented.')
  }
}
