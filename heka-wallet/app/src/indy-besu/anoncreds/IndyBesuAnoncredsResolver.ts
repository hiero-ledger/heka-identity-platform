import {
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
import { AgentContext } from '@credo-ts/core'
import {
  BytesLike,
  ContractFactory,
  getBytes,
  JsonRpcProvider,
  keccak256,
  toUtf8Bytes,
  toUtf8String,
  Wallet,
} from 'ethers'

import { IndyBesuConfig } from '../types'

import CredentialDefinitionRegistryAbi from './abi/CredentialDefinitionRegistry.json'
import SchemaRegistryAbi from './abi/SchemaRegistry.json'

/* eslint-disable @typescript-eslint/no-unused-vars */
export class IndyBesuAnoncredsRegistry implements AnonCredsRegistry {
  private readonly _signer: Wallet
  private readonly _schemaRegistryContractInstance
  private readonly _credentialDefinitionContractInstance

  public methodName = 'indybesu'
  public readonly supportedIdentifier = new RegExp('^did:indybesu:.*')

  constructor(config: IndyBesuConfig) {
    const provider = new JsonRpcProvider(config.rpcUrl)
    this._signer = new Wallet(config.signerPrivateKey).connect(provider)
    this._schemaRegistryContractInstance = ContractFactory.fromSolidity(SchemaRegistryAbi, this._signer).attach(
      config.schemaRegistryContractAddress
    )
    this._credentialDefinitionContractInstance = ContractFactory.fromSolidity(
      CredentialDefinitionRegistryAbi,
      this._signer
    ).attach(config.credentialDefinitionRegistryContractAddress)
  }

  public async getSchema(agentContext: AgentContext, schemaId: string): Promise<GetSchemaReturn> {
    try {
      const parts = schemaId.split(':')
      const schemaIdWithoutNetwork = parts.length === 4 ? `${parts[0]}:${parts[1]}:${parts[3]}` : schemaId

      const { schema } = await this._schemaRegistryContractInstance.resolveSchema(
        this.idAsBytes(schemaIdWithoutNetwork)
      )

      return {
        schema: this.bytesAsObject(schema),
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
    options: RegisterSchemaOptions
  ): Promise<RegisterSchemaReturn> {
    throw new Error('Method not implemented.')
  }

  public async getCredentialDefinition(
    agentContext: AgentContext,
    credentialDefinitionId: string
  ): Promise<GetCredentialDefinitionReturn> {
    try {
      const parts = credentialDefinitionId.split(':')
      const credentialDefinitionIdWithoutNetwork =
        parts.length === 9
          ? `${parts[0]}:${parts[1]}:${parts[3]}:${parts[4]}:${parts[6]}:${parts[7]}:${parts[8]}`
          : credentialDefinitionId

      const { credDef } = await this._credentialDefinitionContractInstance.resolveCredentialDefinition(
        this.idAsBytes(credentialDefinitionIdWithoutNetwork)
      )

      const parsedCredDef = this.bytesAsObject(credDef)

      return {
        credentialDefinition: {
          type: 'CL',
          issuerId: parsedCredDef.issuerId,
          schemaId: parsedCredDef.schemaId,
          tag: parsedCredDef.tag,
          value: parsedCredDef.value,
        },
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
    options: RegisterCredentialDefinitionOptions
  ): Promise<RegisterCredentialDefinitionReturn> {
    throw new Error('Method not implemented.')
  }

  public getRevocationRegistryDefinition(
    agentContext: AgentContext,
    revocationRegistryDefinitionId: string
  ): Promise<GetRevocationRegistryDefinitionReturn> {
    throw new Error('Method not implemented.')
  }

  public registerRevocationRegistryDefinition(
    agentContext: AgentContext,
    options: RegisterRevocationRegistryDefinitionOptions
  ): Promise<RegisterRevocationRegistryDefinitionReturn> {
    throw new Error('Method not implemented.')
  }

  public getRevocationStatusList(
    agentContext: AgentContext,
    revocationRegistryId: string,
    timestamp: number
  ): Promise<GetRevocationStatusListReturn> {
    throw new Error('Method not implemented.')
  }

  public registerRevocationStatusList(
    agentContext: AgentContext,
    options: RegisterRevocationStatusListOptions
  ): Promise<RegisterRevocationStatusListReturn> {
    throw new Error('Method not implemented.')
  }

  private idAsBytes(id: string) {
    return keccak256(toUtf8Bytes(id))
  }

  private bytesAsObject(bytes: BytesLike) {
    return JSON.parse(toUtf8String(getBytes(bytes)))
  }
}
