import type {
  GetCredentialDefinitionReturn,
  GetSchemaReturn,
  RegisterCredentialDefinitionReturn,
  RegisterSchemaReturn,
} from '@credo-ts/anoncreds'
import type { RegisterRevocationRegistryDefinitionReturn } from '@credo-ts/anoncreds/build/services'

import { TenantAgent } from '../agent'

export type Schema = {
  issuerId: string
  name: string
  version: string
  attrNames: string[]
}

export type CredentialDefinition = {
  issuerId: string
  schemaId: string
  tag: string
}

export abstract class AnoncredsRegistry {
  public static readonly method: string

  public abstract getSchema(tenantAgent: TenantAgent, schemaId: string): Promise<GetSchemaReturn>

  public abstract registerSchema(tenantAgent: TenantAgent, options: Schema): Promise<RegisterSchemaReturn>

  public abstract getCredentialDefinition(
    tenantAgent: TenantAgent,
    credentialDefinitionId: string,
  ): Promise<GetCredentialDefinitionReturn>

  public abstract registerCredentialDefinition(
    tenantAgent: TenantAgent,
    options: CredentialDefinition,
  ): Promise<RegisterCredentialDefinitionReturn>

  public abstract registerRevocationRegistryDefinition(
    tenantAgent: TenantAgent,
    issuerId: string,
    credentialDefinitionId: string,
    maximumCredentialNumber?: number,
  ): Promise<RegisterRevocationRegistryDefinitionReturn>
}
