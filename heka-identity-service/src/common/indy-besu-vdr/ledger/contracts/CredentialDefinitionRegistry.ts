import { injectable } from '@credo-ts/core'
import {
  LedgerClient,
  CredentialDefinition as VdrCredentialDefinition,
  CredentialDefinitionRegistry as VdrCredentialDefinitionRegistry,
} from 'indybesu-vdr'

import { IndyBesuSigner } from '../IndyBesuSigner'
import { CredentialDefinition } from '../types'

import { Contract } from './Contract'

@injectable()
export class CredentialDefinitionRegistry extends Contract {
  public static readonly config = {
    address: '0x0000000000000000000000000000000000004444',
    spec: Contract.readContractSpec('CredentialDefinitionRegistry.json'),
  }

  public constructor(client: LedgerClient) {
    super(client)
  }

  public async createCredentialDefinition(credDef: CredentialDefinition, signer: IndyBesuSigner) {
    const vdrCredDef = new VdrCredentialDefinition(credDef.issuerId, credDef.schemaId, credDef.tag, credDef.value)
    const credDefId = vdrCredDef.getId()
    const transaction = await VdrCredentialDefinitionRegistry.buildCreateCredentialDefinitionTransaction(
      this.client,
      signer.address,
      vdrCredDef,
    )
    await this.signAndSubmit(transaction, signer)
    return credDefId
  }

  public async endorseCredentialDefinition(
    credDef: CredentialDefinition,
    identity: IndyBesuSigner,
    signer: IndyBesuSigner,
  ) {
    const vdrCredDef = new VdrCredentialDefinition(credDef.issuerId, credDef.schemaId, credDef.tag, credDef.value)
    const credDefId = vdrCredDef.getId()
    const endorsingData = await VdrCredentialDefinitionRegistry.buildCreateCredentialDefinitionEndorsingData(
      this.client,
      vdrCredDef,
    )
    await identity.signTransaction(endorsingData)
    await this.endorseTransaction(endorsingData, signer)
    return credDefId
  }

  public async resolveCredentialDefinition(id: string): Promise<CredentialDefinition> {
    const credentialDefinition = await VdrCredentialDefinitionRegistry.resolveCredentialDefinition(this.client, id)
    return credentialDefinition.asValue()
  }
}
