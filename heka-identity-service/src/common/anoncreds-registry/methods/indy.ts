import type { RegisterRevocationRegistryDefinitionReturn } from '@credo-ts/anoncreds/build/services'

import {
  GetSchemaReturn,
  RegisterSchemaReturn,
  GetCredentialDefinitionReturn,
  RegisterCredentialDefinitionReturn,
} from '@credo-ts/anoncreds'
import { uuid } from '@credo-ts/core/build/utils/uuid'
import { ConfigType } from '@nestjs/config'

import AgentConfig from '../../../config/agent'
import { defaultMaximumCredentialNumber } from '../../../revocation/revocation-registry/dto/create-revocation-registry.dto'
import { TenantAgent } from '../../agent'
import { AnoncredsRegistry, CredentialDefinition, Schema } from '../anoncreds-registry.types'

export class AnoncredsIndyRegistrar extends AnoncredsRegistry {
  public static readonly method = 'indy'
  private readonly endorserDid!: string

  public constructor(agencyConfig: ConfigType<typeof AgentConfig>) {
    super()
    this.endorserDid = agencyConfig.indyEndorserDid
  }

  public getSchema(tenantAgent: TenantAgent, schemaId: string): Promise<GetSchemaReturn> {
    return tenantAgent.modules.anoncreds.getSchema(schemaId)
  }

  public registerSchema(tenantAgent: TenantAgent, schema: Schema): Promise<RegisterSchemaReturn> {
    return tenantAgent.modules.anoncreds.registerSchema({
      schema,
      options: {
        endorserMode: 'internal',
        endorserDid: this.endorserDid,
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
        endorserMode: 'internal',
        endorserDid: this.endorserDid,
      },
    })
  }

  public registerRevocationRegistryDefinition(
    tenantAgent: TenantAgent,
    issuerId: string,
    credentialDefinitionId: string,
    maximumCredentialNumber?: number,
  ): Promise<RegisterRevocationRegistryDefinitionReturn> {
    return tenantAgent.modules.anoncreds.registerRevocationRegistryDefinition({
      revocationRegistryDefinition: {
        issuerId,
        maximumCredentialNumber: maximumCredentialNumber ?? defaultMaximumCredentialNumber,
        tag: uuid(),
        credentialDefinitionId,
      },
      options: {
        endorserMode: 'internal',
        endorserDid: this.endorserDid,
      },
    })
  }
}
