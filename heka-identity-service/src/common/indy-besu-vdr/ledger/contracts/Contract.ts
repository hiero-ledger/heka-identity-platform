import fs from 'fs'
import path from 'path'

import { injectable } from '@credo-ts/core'
import { LedgerClient, Transaction, TransactionEndorsingData, Endorsement } from 'indybesu-vdr'

import { IndyBesuSigner } from '../IndyBesuSigner'

@injectable()
export class Contract {
  protected client: LedgerClient

  public constructor(client: LedgerClient) {
    this.client = client
  }

  public async signAndSubmit(transaction: Transaction, signer: IndyBesuSigner) {
    await signer.signTransaction(transaction)
    const transactionHash = await this.client.submitTransaction(transaction)
    return await this.client.getReceipt(transactionHash)
  }

  public async endorseTransaction(endorsingData: TransactionEndorsingData, signer: IndyBesuSigner) {
    const transaction = await Endorsement.buildEndorsementTransaction(this.client, signer.address, endorsingData)
    return await this.signAndSubmit(transaction, signer)
  }

  protected static readContractSpec(file: string) {
    const dir =
      typeof __dirname !== 'undefined'
        ? __dirname
        : path.resolve(process.cwd(), 'src/common/indy-besu-vdr/ledger/contracts')
    const contractFilePath = path.resolve(dir, `./abi/${file}`)
    const spec = fs.readFileSync(contractFilePath, 'utf8')
    return JSON.parse(spec)
  }
}
