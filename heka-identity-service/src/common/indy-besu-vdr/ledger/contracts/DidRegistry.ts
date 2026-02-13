import { injectable } from '@credo-ts/core'
import { IndyDidRegistry, LedgerClient } from 'indybesu-vdr'

import { IndyBesuSigner } from '../IndyBesuSigner'
import { DidDocument } from '../types'

import { Contract } from './Contract'

@injectable()
export class DidRegistry extends Contract {
  public static readonly config = {
    address: '0x0000000000000000000000000000000000003333',
    spec: Contract.readContractSpec('IndyDidRegistry.json'),
  }

  public constructor(client: LedgerClient) {
    super(client)
  }

  public async createDid(didDocument: DidDocument, identity: IndyBesuSigner, signer: IndyBesuSigner) {
    const transaction = await IndyDidRegistry.buildCreateDidTransaction(
      this.client,
      signer.address,
      didDocument.id,
      didDocument,
    )
    return await this.signAndSubmit(transaction, signer)
  }

  public async endorseDid(didDocument: DidDocument, identity: IndyBesuSigner, signer: IndyBesuSigner) {
    const endorsingData = await IndyDidRegistry.buildCreateDidEndorsingData(this.client, didDocument.id, didDocument)
    await identity.signTransaction(endorsingData)
    return await this.endorseTransaction(endorsingData, signer)
  }

  public async updateDid(didDocument: DidDocument, signer: IndyBesuSigner) {
    const transaction = await IndyDidRegistry.buildUpdateDidTransaction(
      this.client,
      signer.address,
      didDocument.id,
      didDocument,
    )
    return await this.signAndSubmit(transaction, signer)
  }

  public async deactivateDid(id: string, signer: IndyBesuSigner) {
    const transaction = await IndyDidRegistry.buildDeactivateDidTransaction(this.client, signer.address, id)
    return await this.signAndSubmit(transaction, signer)
  }

  public async resolveDid(id: string): Promise<{ document: DidDocument }> {
    const transaction = await IndyDidRegistry.buildResolveDidTransaction(this.client, id)
    const response = await this.client.submitTransaction(transaction)
    return IndyDidRegistry.parseResolveDidResult(this.client, response)
  }
}
