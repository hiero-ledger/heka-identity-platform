import {
  GetSchemaReturn,
  RegisterSchemaReturn,
  GetCredentialDefinitionReturn,
  RegisterCredentialDefinitionReturn,
  RegisterRevocationRegistryDefinitionReturn,
} from '@credo-ts/anoncreds'
import { ConfigType } from '@nestjs/config'

import { uuid } from 'utils/misc'

import AgentConfig from '../../../config/agent'
import { defaultMaximumCredentialNumber } from '../../../revocation/revocation-registry/dto/create-revocation-registry.dto'
import { TenantAgent } from '../../agent'
import { ensureIndyEndorserDid } from '../../did-registrar/methods/did-indy'
import { AnoncredsRegistry, CredentialDefinition, Schema } from '../anoncreds-registry.types'

export class AnoncredsIndyRegistrar extends AnoncredsRegistry {
  public static readonly method = 'indy'
  private readonly endorserSeed!: string
  private readonly endorserDid!: string

  public constructor(agencyConfig: ConfigType<typeof AgentConfig>) {
    super()
    this.endorserSeed = agencyConfig.indyEndorserSeed
    this.endorserDid = agencyConfig.indyEndorserDid
  }

  public getSchema(tenantAgent: TenantAgent, schemaId: string): Promise<GetSchemaReturn> {
    return tenantAgent.modules.anoncreds.getSchema(schemaId)
  }

  public async registerSchema(tenantAgent: TenantAgent, schema: Schema): Promise<RegisterSchemaReturn> {
    await ensureIndyEndorserDid(tenantAgent, this.endorserDid, this.endorserSeed)
    return await tenantAgent.modules.anoncreds.registerSchema({
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

  public async registerCredentialDefinition(
    tenantAgent: TenantAgent,
    credDef: CredentialDefinition,
  ): Promise<RegisterCredentialDefinitionReturn> {
    await ensureIndyEndorserDid(tenantAgent, this.endorserDid, this.endorserSeed)
    return await tenantAgent.modules.anoncreds.registerCredentialDefinition({
      credentialDefinition: credDef,
      options: {
        supportRevocation: true,
        endorserMode: 'internal',
        endorserDid: this.endorserDid,
      },
    })
  }

  public async registerRevocationRegistryDefinition(
    tenantAgent: TenantAgent,
    issuerId: string,
    credentialDefinitionId: string,
    maximumCredentialNumber?: number,
  ): Promise<RegisterRevocationRegistryDefinitionReturn> {
    await ensureIndyEndorserDid(tenantAgent, this.endorserDid, this.endorserSeed)
    return await tenantAgent.modules.anoncreds.registerRevocationRegistryDefinition({
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
