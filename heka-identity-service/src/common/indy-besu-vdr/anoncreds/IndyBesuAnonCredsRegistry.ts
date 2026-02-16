import type {
  AnonCredsRegistry,
  GetCredentialDefinitionReturn,
  GetRevocationRegistryDefinitionReturn,
  GetRevocationStatusListReturn,
  GetSchemaReturn,
  RegisterCredentialDefinitionOptions,
  RegisterCredentialDefinitionReturn,
  RegisterRevocationRegistryDefinitionOptions,
  RegisterRevocationRegistryDefinitionReturn,
  RegisterRevocationStatusListOptions,
  RegisterRevocationStatusListReturn,
  RegisterSchemaOptions,
  RegisterSchemaReturn,
} from '@credo-ts/anoncreds'

import { type AgentContext, CredoError, DidRepository, DidsApi } from '@credo-ts/core'
import { KeyManagementApi } from '@credo-ts/core/build/modules/kms'

import { CredentialDefinitionRegistry, IndyBesuSigner, SchemaRegistry } from '../ledger'
import { indyBesuAnonCredsRegistryIdentifierRegex } from '../utils/identifier'

import { fromIndyBesuCredentialDefinition } from './AnoncredsTypesMapping'

export class IndyBesuAnonCredsRegistry implements AnonCredsRegistry {
  public methodName = 'indybesu'
  public readonly supportedIdentifier = indyBesuAnonCredsRegistryIdentifierRegex

  public async getSchema(agentContext: AgentContext, schemaId: string): Promise<GetSchemaReturn> {
    try {
      const schemaRegistry = agentContext.dependencyManager.resolve(SchemaRegistry)

      const schema = await schemaRegistry.resolveSchema(schemaId)

      return {
        schema: schema,
        schemaId,
        resolutionMetadata: {},
        schemaMetadata: {},
      }
    } catch (error) {
      return {
        schemaId,
        resolutionMetadata: {
          error: 'unknownError',
          message: `unable to resolve schema: ${(error as Error).message}`,
        },
        schemaMetadata: {},
      }
    }
  }

  public async registerSchema(
    agentContext: AgentContext,
    options: IndyBesuRegisterSchemaOptions,
  ): Promise<RegisterSchemaReturn> {
    try {
      const schemaRegistry = agentContext.dependencyManager.resolve(SchemaRegistry)

      const issuer = await this.getSigner(agentContext, options.schema.issuerId)
      const endorser = await this.getEndorserSigner(agentContext, options.options.endorserKey)
      const schemaId = await schemaRegistry.endorseSchema(options.schema, issuer, endorser)

      return {
        schemaState: {
          state: 'finished',
          schema: options.schema,
          schemaId: schemaId,
        },
        registrationMetadata: {},
        schemaMetadata: {},
      }
    } catch (error) {
      return {
        schemaMetadata: {},
        registrationMetadata: {},
        schemaState: {
          state: 'failed',
          reason: `unknownError: ${(error as Error).message}`,
        },
      }
    }
  }

  public async getCredentialDefinition(
    agentContext: AgentContext,
    credentialDefinitionId: string,
  ): Promise<GetCredentialDefinitionReturn> {
    try {
      const credentialDefinitionRegistry = agentContext.dependencyManager.resolve(CredentialDefinitionRegistry)

      const credDef = await credentialDefinitionRegistry.resolveCredentialDefinition(credentialDefinitionId)

      return {
        credentialDefinition: fromIndyBesuCredentialDefinition(credDef),
        credentialDefinitionId,
        resolutionMetadata: {},
        credentialDefinitionMetadata: {},
      }
    } catch (error) {
      return {
        credentialDefinitionId,
        resolutionMetadata: {
          error: 'unknownError',
          message: `unable to resolve credential definition: ${(error as Error).message}`,
        },
        credentialDefinitionMetadata: {},
      }
    }
  }

  public async registerCredentialDefinition(
    agentContext: AgentContext,
    options: IndyBesuRegisterCredentialDefinitionOptions,
  ): Promise<RegisterCredentialDefinitionReturn> {
    try {
      const credentialDefinitionRegistry = agentContext.dependencyManager.resolve(CredentialDefinitionRegistry)

      const schema = await this.getSchema(agentContext, options.credentialDefinition.schemaId)
      if (!schema.schema) {
        throw new CredoError(`Schema not found for schemaId: ${options.credentialDefinition.schemaId}`)
      }

      const issuer = await this.getSigner(agentContext, options.credentialDefinition.issuerId)
      const endorser = await this.getEndorserSigner(agentContext, options.options.endorserKey)
      const createCredentialDefinitionId = await credentialDefinitionRegistry.endorseCredentialDefinition(
        {
          ...options.credentialDefinition,
          credDefType: options.credentialDefinition.type,
        },
        issuer,
        endorser,
      )

      return {
        credentialDefinitionState: {
          state: 'finished',
          credentialDefinition: options.credentialDefinition,
          credentialDefinitionId: createCredentialDefinitionId,
        },
        registrationMetadata: {},
        credentialDefinitionMetadata: {},
      }
    } catch (error) {
      return {
        credentialDefinitionMetadata: {},
        registrationMetadata: {},
        credentialDefinitionState: {
          state: 'failed',
          reason: `unknownError: ${(error as Error).message}`,
        },
      }
    }
  }

  public getRevocationRegistryDefinition(
    agentContext: AgentContext,
    revocationRegistryDefinitionId: string,
  ): Promise<GetRevocationRegistryDefinitionReturn> {
    throw new Error('Method not implemented.')
  }

  public registerRevocationRegistryDefinition(
    agentContext: AgentContext,
    options: RegisterRevocationRegistryDefinitionOptions,
  ): Promise<RegisterRevocationRegistryDefinitionReturn> {
    throw new Error('Method not implemented.')
  }

  public getRevocationStatusList(
    agentContext: AgentContext,
    revocationRegistryId: string,
    timestamp: number,
  ): Promise<GetRevocationStatusListReturn> {
    throw new Error('Method not implemented.')
  }

  public registerRevocationStatusList(
    agentContext: AgentContext,
    options: RegisterRevocationStatusListOptions,
  ): Promise<RegisterRevocationStatusListReturn> {
    throw new Error('Method not implemented.')
  }

  private async getSigner(agentContext: AgentContext, did: string) {
    const didsApi = agentContext.dependencyManager.resolve(DidsApi)
    const { didDocument } = await didsApi.resolve(did)
    if (!didDocument || !didDocument.verificationMethod?.length) {
      throw new Error('Unable o resolved signer DID Document')
    }
    const didDocumentRelativeKeyId = didDocument.verificationMethod[0].id
    if (!didDocumentRelativeKeyId) {
      throw new Error('Unable to resolve the signer key')
    }

    const kms = agentContext.dependencyManager.resolve(KeyManagementApi)
    const didRepository = agentContext.dependencyManager.resolve(DidRepository)
    const didRecords = await didRepository.findAllByDid(agentContext, did)
    const keys =
      didRecords.find((r) => r.keys?.find((k) => k.didDocumentRelativeKeyId === didDocumentRelativeKeyId))?.keys ?? []
    if (!keys.length) {
      throw new Error(`Key for didDocumentRelativeKeyId (${didDocumentRelativeKeyId}) not found`)
    }

    const kmsKeyId = keys[0].kmsKeyId
    return await IndyBesuSigner.create(kmsKeyId, kms)
  }

  private async getEndorserSigner(agentContext: AgentContext, endorserKeyId: string) {
    const kms = agentContext.dependencyManager.resolve(KeyManagementApi)
    return await IndyBesuSigner.create(endorserKeyId, kms)
  }
}

export interface IndyBesuRegisterSchemaOptions extends RegisterSchemaOptions {
  options: {
    issuerId: string
    endorserKey: string
  }
}

export interface IndyBesuRegisterCredentialDefinitionOptions extends RegisterCredentialDefinitionOptions {
  options: {
    supportRevocation: boolean
    issuerId: string
    endorserKey: string
  }
}
