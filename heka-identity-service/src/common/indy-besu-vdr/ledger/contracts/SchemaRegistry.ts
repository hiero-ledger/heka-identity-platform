import { injectable } from '@credo-ts/core'
import { LedgerClient, SchemaRegistry as VdrSchemaRegistry, Schema as VdrSchema } from 'indybesu-vdr'

import { IndyBesuSigner } from '../IndyBesuSigner'
import { Schema } from '../types'

import { Contract } from './Contract'

@injectable()
export class SchemaRegistry extends Contract {
  public static readonly config = {
    address: '0x0000000000000000000000000000000000005555',
    spec: Contract.readContractSpec('SchemaRegistry.json'),
  }

  public constructor(client: LedgerClient) {
    super(client)
  }

  public async createSchema(schema: Schema, signer: IndyBesuSigner) {
    const vdrSchema = new VdrSchema(schema.issuerId, schema.name, schema.version, schema.attrNames)
    const schemaId = vdrSchema.getId()
    const transaction = await VdrSchemaRegistry.buildCreateSchemaTransaction(this.client, signer.address, vdrSchema)
    await this.signAndSubmit(transaction, signer)
    return schemaId
  }

  public async endorseSchema(schema: Schema, identity: IndyBesuSigner, signer: IndyBesuSigner) {
    const vdrSchema = new VdrSchema(schema.issuerId, schema.name, schema.version, schema.attrNames)
    const schemaId = vdrSchema.getId()
    const endorsingData = await VdrSchemaRegistry.buildCreateSchemaEndorsingData(this.client, vdrSchema)
    await identity.signTransaction(endorsingData)
    await this.endorseTransaction(endorsingData, signer)
    return schemaId
  }

  public async resolveSchema(id: string): Promise<Schema> {
    const schema = await VdrSchemaRegistry.resolveSchema(this.client, id)
    return schema.asValue()
  }
}
