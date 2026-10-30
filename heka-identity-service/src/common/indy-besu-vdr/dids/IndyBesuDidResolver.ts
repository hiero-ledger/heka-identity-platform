import { AgentContext, DidDocumentMetadata, DidResolutionResult, DidResolver } from '@credo-ts/core'

import { DidMetadata, DidRegistry } from '../ledger'

import { fromIndyBesuDidDocument } from './DidTypesMapping'

export class IndyBesuDidResolver implements DidResolver {
  public readonly supportedMethods = ['indybesu']

  // Always read from the ledger, also for a DID of the wallet itself: its deactivation is only known there
  public readonly allowsCaching = false

  public async resolve(agentContext: AgentContext, did: string): Promise<DidResolutionResult> {
    const didRegistry = agentContext.dependencyManager.resolve(DidRegistry)

    try {
      const { document, metadata } = await didRegistry.resolveDid(did)

      // A deactivated DID keeps its document, as W3C DID Resolution allows; the metadata marks it
      return {
        didDocument: fromIndyBesuDidDocument(document),
        didDocumentMetadata: toDidDocumentMetadata(metadata),
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

function toDidDocumentMetadata(metadata?: Partial<DidMetadata>): DidDocumentMetadata {
  if (!metadata) {
    return {}
  }
  const isoTime = (seconds: unknown) =>
    seconds !== undefined && seconds !== null && Number(seconds) > 0
      ? new Date(Number(seconds) * 1000).toISOString()
      : undefined

  const didDocumentMetadata: DidDocumentMetadata = {}
  const created = isoTime(metadata.created)
  const updated = isoTime(metadata.updated)
  if (created) didDocumentMetadata.created = created
  if (updated) didDocumentMetadata.updated = updated
  if (metadata.versionId !== undefined && metadata.versionId !== null) {
    didDocumentMetadata.versionId = String(metadata.versionId)
  }
  if (metadata.deactivated === true) didDocumentMetadata.deactivated = true
  return didDocumentMetadata
}
