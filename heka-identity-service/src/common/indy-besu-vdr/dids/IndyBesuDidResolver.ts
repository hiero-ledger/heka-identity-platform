import { AgentContext, DidResolutionResult, DidResolver } from '@credo-ts/core'

import { DidRegistry } from '../ledger'

import { fromIndyBesuDidDocument } from './DidTypesMapping'

export class IndyBesuDidResolver implements DidResolver {
  public readonly supportedMethods = ['indybesu']

  public readonly allowsCaching = false

  public async resolve(agentContext: AgentContext, did: string): Promise<DidResolutionResult> {
    const didRegistry = agentContext.dependencyManager.resolve(DidRegistry)

    try {
      const { document } = await didRegistry.resolveDid(did)

      return {
        didDocument: fromIndyBesuDidDocument(document),
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
