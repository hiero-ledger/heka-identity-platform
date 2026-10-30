import fs from 'fs'
import path from 'path'

import { injectable } from '@credo-ts/core'

import { LedgerClient, Transaction, TransactionEndorsingData, Endorsement } from 'indybesu-vdr'

import { IndyBesuSigner } from '../IndyBesuSigner'

/**
 * A failure once a signed transaction was handed to the ledger client: the node may have received it, so it may still
 * be mined. Whoever holds resources tied to the write (new keys) must not treat it as "nothing written". The message is
 * the one of the underlying error.
 */
export class TransactionOutcomeUnknownError extends Error {
  public constructor(public readonly underlyingError: unknown) {
    super(underlyingError instanceof Error ? underlyingError.message : String(underlyingError))
    this.name = 'TransactionOutcomeUnknownError'
  }
}

@injectable()
export class Contract {
  protected client: LedgerClient

  public constructor(client: LedgerClient) {
    this.client = client
  }

  public async signAndSubmit(transaction: Transaction, signer: IndyBesuSigner) {
    await signer.signTransaction(transaction)
    try {
      const transactionHash = await this.client.submitTransaction(transaction)
      return await this.client.getReceipt(transactionHash)
    } catch (error) {
      throw new TransactionOutcomeUnknownError(error)
    }
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
