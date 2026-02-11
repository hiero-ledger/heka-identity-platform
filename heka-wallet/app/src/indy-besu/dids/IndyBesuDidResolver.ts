import { DidResolutionResult, AgentContext, DidResolver } from '@credo-ts/core'
import { ContractFactory, getBytes, JsonRpcProvider, toUtf8String, Wallet } from 'ethers'

import { IndyBesuConfig } from '../types'

import { fromIndyBesuDidDocument } from './DidTypesMapping'
import IndyDidRegistryAbi from './abi/IndyDidRegistry.json'

export class IndyBesuDidResolver implements DidResolver {
  private readonly _signer: Wallet
  private readonly _contractInstance

  public readonly supportedMethods = ['indybesu']

  public readonly allowsCaching = false

  constructor(config: IndyBesuConfig) {
    const provider = new JsonRpcProvider(config.rpcUrl)
    this._signer = new Wallet(config.signerPrivateKey).connect(provider)
    this._contractInstance = ContractFactory.fromSolidity(IndyDidRegistryAbi, this._signer).attach(
      config.didRegistryContractAddress
    )
  }

  public async resolve(_: AgentContext, did: string): Promise<DidResolutionResult> {
    try {
      const didAddress = did.split(':')[3]
      const { document } = await this._contractInstance.resolveDid(didAddress)

      const parsedDocument = JSON.parse(toUtf8String(getBytes(document)))
      return {
        didDocument: fromIndyBesuDidDocument(parsedDocument),
        didDocumentMetadata: {},
        didResolutionMetadata: {},
      }
    } catch (error) {
      return {
        didDocument: null,
        didDocumentMetadata: {},
        didResolutionMetadata: {
          error: 'unknownError',
          message: `resolver_error: Unable to resolve did '${did}': ${(error as Error).message}`,
        },
      }
    }
  }
}
