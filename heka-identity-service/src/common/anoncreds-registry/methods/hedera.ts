import {
  GetCredentialDefinitionReturn,
  GetSchemaReturn,
  RegisterCredentialDefinitionReturn,
  RegisterRevocationRegistryDefinitionReturn,
  RegisterSchemaReturn,
} from '@credo-ts/anoncreds'
import { uuid } from '@credo-ts/core/build/utils/uuid'

import { defaultMaximumCredentialNumber } from '../../../revocation/revocation-registry/dto/create-revocation-registry.dto'
import { TenantAgent } from '../../agent'
import { AnoncredsRegistry, CredentialDefinition, Schema } from '../anoncreds-registry.types'

export class AnoncredsHederaRegistrar extends AnoncredsRegistry {
  public static readonly method = 'hedera'

  public getSchema(tenantAgent: TenantAgent, schemaId: string): Promise<GetSchemaReturn> {
    return tenantAgent.modules.anoncreds.getSchema(schemaId)
  }

  public registerSchema(tenantAgent: TenantAgent, schema: Schema): Promise<RegisterSchemaReturn> {
    return tenantAgent.modules.anoncreds.registerSchema({
      schema,
      options: {},
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
      },
    })
  }

  public registerRevocationRegistryDefinition(
    tenantAgent: TenantAgent,
    issuerId: string,
    credentialDefinitionId: string,
    maximumCredentialNumber?: number | undefined,
  ): Promise<RegisterRevocationRegistryDefinitionReturn> {
    return tenantAgent.modules.anoncreds.registerRevocationRegistryDefinition({
      revocationRegistryDefinition: {
        issuerId,
        maximumCredentialNumber: maximumCredentialNumber ?? defaultMaximumCredentialNumber,
        tag: uuid(),
        credentialDefinitionId,
      },
      options: {},
    })
  }
}
