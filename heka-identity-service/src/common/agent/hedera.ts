import { AgentContext, DependencyManager, DidDocument, injectable } from '@credo-ts/core'
import { HederaDidUpdateOptions, HederaLedgerService, HederaModule, HederaModuleConfig } from '@credo-ts/hedera'

const CONTROLLER_ONLY_PROPERTIES = new Set(['id', 'controller', 'context', '@context'])

function isControllerOnly(didDocument: DidDocument | Record<string, unknown> | undefined): boolean {
  if (!didDocument) {
    return false
  }
  return Object.entries(didDocument).every(
    ([property, value]) =>
      CONTROLLER_ONLY_PROPERTIES.has(property) || value === undefined || (Array.isArray(value) && value.length === 0),
  )
}

/**
 * Credo sets the controller of a new `did:hedera` only from a DID document passed to `create`, and then applies that
 * document as an update. A document that carries nothing but the controller leaves nothing to update, and the Hiero
 * SDK rejects an empty update after the DID has already been written. The controller is part of the DID's creation
 * message, so that empty update is skipped and the created DID document is returned.
 */
@injectable()
export class HekaHederaLedgerService extends HederaLedgerService {
  public constructor(config: HederaModuleConfig) {
    super(config)
  }

  public override async updateDid(agentContext: AgentContext, props: HederaDidUpdateOptions) {
    if (props.didDocumentOperation === 'setDidDocument' && isControllerOnly(props.didDocument)) {
      const { didDocument } = await this.resolveDid(agentContext, props.did)
      if (!didDocument) {
        throw new Error(`DID ${props.did} not found`)
      }
      return { did: props.did, didDocument }
    }
    return await super.updateDid(agentContext, props)
  }
}

export class HekaHederaModule extends HederaModule {
  public override register(dependencyManager: DependencyManager): void {
    super.register(dependencyManager)
    dependencyManager.registerSingleton(HederaLedgerService, HekaHederaLedgerService)
  }
}
