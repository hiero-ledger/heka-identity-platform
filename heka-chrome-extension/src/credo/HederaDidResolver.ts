import type { AgentContext, DidResolutionResult, DidResolver } from '@credo-ts/core'
import { DidDocument, JsonTransformer } from '@credo-ts/core'
import { resolveDID, TopicReaderHederaRestApi } from '@hiero-did-sdk/resolver'

const RESOLUTION_ACCEPT = 'application/ld+json;profile="https://w3id.org/did-resolution"' as const
const topicReader = new TopicReaderHederaRestApi()

/**
 * Resolves did:hedera from the public Hedera mirror node.
 * The issuer signs the contributor credential with a did:hedera key, and the
 * wallet has to fetch that DID document before it can accept the credential.
 */
export class HederaDidResolver implements DidResolver {
  public readonly supportedMethods = ['hedera']
  public readonly allowsCaching = true
  public readonly allowsLocalDidRecord = false

  public async resolve(agentContext: AgentContext, did: string): Promise<DidResolutionResult> {
    const identifier = did.split('#')[0].split('?')[0]
    try {
      const resolved = await resolveDID(identifier, RESOLUTION_ACCEPT, { topicReader })
      const didDocument = JsonTransformer.fromJSON(resolved.didDocument, DidDocument)
      return {
        didDocument,
        didDocumentMetadata: resolved.didDocumentMetadata,
        didResolutionMetadata: resolved.didResolutionMetadata,
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to resolve did:hedera'
      agentContext.config.logger.warn(`Unable to resolve ${identifier}: ${message}`)
      return {
        didDocument: null,
        didDocumentMetadata: {},
        didResolutionMetadata: {
          error: 'notFound',
          message,
        },
      }
    }
  }
}
