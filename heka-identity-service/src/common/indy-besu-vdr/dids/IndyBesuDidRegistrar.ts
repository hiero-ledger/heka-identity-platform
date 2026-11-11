import {
  AgentContext,
  DidCreateOptions,
  DidCreateResult,
  DidDeactivateOptions,
  DidDeactivateResult,
  DidDocument,
  DidDocumentBuilder,
  DidDocumentKey,
  DidDocumentService,
  DidRegistrar,
  DidRepository,
  DidUpdateOptions,
  DidUpdateResult,
  getEcdsaSecp256k1VerificationKey2019,
  DidsApi,
  Kms,
} from '@credo-ts/core'

import { DidRegistry, IndyBesuSigner, TransactionOutcomeUnknownError } from '../ledger'

import { fromIndyBesuDidDocument, toIndyBesuDidDocument } from './DidTypesMapping'
import { buildDid } from './DidUtils'

// The key of the DID's own account: the DID is built from its address, and only that account can change the DID
export const OWNER_KEY_FRAGMENT = '#KEY-1'

export class IndyBesuDidRegistrar implements DidRegistrar {
  public readonly supportedMethods = ['indybesu']

  public async create(agentContext: AgentContext, options: IndyBesuDidCreateOptions): Promise<DidCreateResult> {
    const didRegistry = agentContext.dependencyManager.resolve(DidRegistry)
    const didsApi = agentContext.dependencyManager.resolve(DidsApi)
    const kms = agentContext.dependencyManager.resolve(Kms.KeyManagementApi)

    const key = await kms.createKey({
      type: {
        kty: 'EC',
        crv: 'secp256k1',
      },
    })

    let writtenToLedger = false
    try {
      const publicJwk = Kms.PublicJwk.fromPublicJwk(key.publicJwk)
      const didDocument = this.buildDidDocument(publicJwk, {
        method: options.method,
        network: options.options.network,
        endpoints: options.options.endpoints,
      })

      const endorser = await IndyBesuSigner.create(agentContext, options.options.endorserKeyId)
      const identity = await IndyBesuSigner.create(agentContext, key.keyId)

      await didRegistry.endorseDid(toIndyBesuDidDocument(didDocument), identity, endorser)
      writtenToLedger = true

      await didsApi.import({
        did: didDocument.id,
        didDocument,
        keys: [
          {
            kmsKeyId: key.keyId,
            didDocumentRelativeKeyId: OWNER_KEY_FRAGMENT,
          },
        ],
      })

      return {
        didDocumentMetadata: {},
        didRegistrationMetadata: {},
        didState: {
          state: 'finished',
          did: didDocument.id,
          didDocument: didDocument,
        },
      }
    } catch (error) {
      // Once the DID is on the ledger its key is the only one that can change it, so it is kept. That includes a
      // transaction that was sent but not confirmed: it may still be mined
      if (error instanceof TransactionOutcomeUnknownError) {
        agentContext.config.logger.warn('did:indybesu creation failed after its transaction was sent; its key is kept')
      } else if (!writtenToLedger) {
        await kms.deleteKey({ keyId: key.keyId }).catch(() => undefined)
      }
      return {
        didDocumentMetadata: {},
        didRegistrationMetadata: {},
        didState: {
          state: 'failed',
          reason: `unknownError: ${errorReason(error)}`,
        },
      }
    }
  }

  /**
   * Replaces the DID document on the ledger, sent by the DID's own account (`updateDid`, no endorser). The owner key must
   * stay the first verification method, unchanged: it is the DID's address and the only key the ledger accepts. The new
   * keys in `secret.keys` belong to the caller. A failed result tells it whether it may delete them: see
   * `isNothingSubmitted`.
   */
  public async update(agentContext: AgentContext, options: IndyBesuDidUpdateOptions): Promise<DidUpdateResult> {
    const didRegistry = agentContext.dependencyManager.resolve(DidRegistry)
    const didRepository = agentContext.dependencyManager.resolve(DidRepository)
    const { did } = options
    const newKeys = options.secret?.keys ?? []

    // The type allows only `setDidDocument`, but the options come through Credo's generic `DidsApi.update`
    const operation: string | undefined = options.didDocumentOperation
    if (operation && operation !== 'setDidDocument') {
      return failedResult(`did:indybesu replaces the whole document; '${operation}' is not supported`, NOT_SUBMITTED)
    }
    if (!(options.didDocument instanceof DidDocument) || options.didDocument.id !== did) {
      return failedResult('The new DID document must be a DidDocument of the DID', NOT_SUBMITTED)
    }
    const didDocument = options.didDocument

    const didRecord = await didRepository.findCreatedDid(agentContext, did)
    const ownerKey = didRecord && findOwnerKey(didRecord.keys)
    if (!didRecord || !ownerKey) {
      return failedResult('DID not found in this wallet', NOT_SUBMITTED)
    }

    const ledgerDocument = toIndyBesuDidDocument(didDocument)
    try {
      const { document: currentDocument } = await didRegistry.resolveDid(did)
      const [currentOwner] = currentDocument.verificationMethod
      const [newOwner] = ledgerDocument.verificationMethod
      if (
        !currentOwner ||
        !newOwner ||
        currentOwner.id !== newOwner.id ||
        currentOwner.publicKeyBase58 !== newOwner.publicKeyBase58
      ) {
        return failedResult(
          `The owner key ${OWNER_KEY_FRAGMENT} must stay the first verification method, unchanged`,
          NOT_SUBMITTED,
        )
      }

      await didRegistry.updateDid(ledgerDocument, await IndyBesuSigner.create(agentContext, ownerKey.kmsKeyId))
    } catch (error) {
      // The transaction may have been mined although waiting for it failed: the ledger decides
      const written = await didRegistry
        .resolveDid(did)
        .then(({ document }) => canonicalJson(document) === canonicalJson(ledgerDocument))
        .catch(() => false)
      if (!written) {
        // Only a failure once the transaction was sent leaves the outcome open (it may still be mined)
        return failedResult(errorReason(error), {
          transactionSubmitted: error instanceof TransactionOutcomeUnknownError,
        })
      }
    }

    const keptKeys = (didRecord.keys ?? []).filter(
      (key) =>
        key !== ownerKey &&
        (didDocument.verificationMethod ?? []).some(({ id }) => id.endsWith(key.didDocumentRelativeKeyId)),
    )
    didRecord.didDocument = didDocument
    didRecord.keys = [ownerKey, ...keptKeys, ...newKeys]
    await didRepository.update(agentContext, didRecord)

    return {
      didDocumentMetadata: {},
      didRegistrationMetadata: {},
      didState: { state: 'finished', did, didDocument },
    }
  }

  /**
   * Deactivates the DID on the ledger, sent by the DID's own account (`deactivateDid`). The ledger keeps the document
   * and rejects a second deactivation. The keys stay in the wallet.
   */
  public async deactivate(
    agentContext: AgentContext,
    options: IndyBesuDidDeactivateOptions,
  ): Promise<DidDeactivateResult> {
    const didRegistry = agentContext.dependencyManager.resolve(DidRegistry)
    const didRepository = agentContext.dependencyManager.resolve(DidRepository)
    const { did } = options

    const didRecord = await didRepository.findCreatedDid(agentContext, did)
    const ownerKey = didRecord && findOwnerKey(didRecord.keys)
    if (!didRecord || !ownerKey) {
      return failedResult('DID not found in this wallet')
    }

    try {
      await didRegistry.deactivateDid(did, await IndyBesuSigner.create(agentContext, ownerKey.kmsKeyId))
    } catch (error) {
      const deactivated = await didRegistry
        .resolveDid(did)
        .then(({ metadata }) => metadata?.deactivated === true)
        .catch(() => false)
      if (!deactivated) {
        return failedResult(errorReason(error))
      }
    }

    const didDocument = didRecord.didDocument ?? fromIndyBesuDidDocument((await didRegistry.resolveDid(did)).document)
    return {
      didDocumentMetadata: { deactivated: true },
      didRegistrationMetadata: {},
      didState: { state: 'finished', did, didDocument },
    }
  }

  private buildDidDocument(publicJwk: Kms.PublicJwk<Kms.Secp256k1PublicJwk>, options: BuildDidDocumentOptions) {
    const did = buildDid(options.method, options.network, publicJwk)

    const verificationMethod = getEcdsaSecp256k1VerificationKey2019({
      id: `${did}${OWNER_KEY_FRAGMENT}`,
      publicJwk,
      controller: did,
    })

    const didDocumentBuilder = new DidDocumentBuilder(did)
      .addContext('https://www.w3.org/ns/did/v1')
      .addVerificationMethod(verificationMethod)
      .addAuthentication(verificationMethod.id)
      .addAssertionMethod(verificationMethod.id)

    options.endpoints?.forEach((endpoint) => {
      const service = new DidDocumentService({
        id: `${did}#${endpoint.type}`,
        serviceEndpoint: endpoint.endpoint,
        type: endpoint.type,
      })
      didDocumentBuilder.addService(service)
    })

    return didDocumentBuilder.build()
  }
}

export interface IndyBesuEndpoint {
  type: string
  endpoint: string
}

export interface IndyBesuDidCreateOptions extends DidCreateOptions {
  method: 'indybesu'
  did?: never
  options: {
    network: string
    endpoints?: IndyBesuEndpoint[]
    endorserKeyId: string
  }
  secret?: Record<string, never>
}

// The DID's own key signs updates and deactivations; it is taken from the DID record
export interface IndyBesuDidUpdateOptions extends DidUpdateOptions {
  didDocumentOperation?: 'setDidDocument'
  didDocument: DidDocument
  secret?: {
    // Keys of verification methods new in the document
    keys?: DidDocumentKey[]
  }
}

export type IndyBesuDidDeactivateOptions = DidDeactivateOptions

function findOwnerKey(keys: DidDocumentKey[] = []): DidDocumentKey | undefined {
  return keys.find(({ didDocumentRelativeKeyId }) => didDocumentRelativeKeyId.endsWith(OWNER_KEY_FRAGMENT))
}

/** The reason of a failure, as returned to the API client: a KMS error names the KMS key id, so it is not passed on. */
function errorReason(error: unknown): string {
  if (error instanceof Kms.KeyManagementError) {
    return 'A key of the DID is not available in the wallet'
  }
  return error instanceof Error ? error.message : String(error)
}

const NOT_SUBMITTED = { transactionSubmitted: false }

/**
 * Whether a failed `update` certainly sent nothing to the ledger, so that the keys created for it can be deleted. Any
 * other failure (including one that does not say) may still be mined.
 */
export function isNothingSubmitted(result: DidUpdateResult): boolean {
  return result.didRegistrationMetadata.transactionSubmitted === false
}

function failedResult(
  reason: string,
  didRegistrationMetadata: Record<string, unknown> = {},
): DidUpdateResult & DidDeactivateResult {
  return {
    didDocumentMetadata: {},
    didRegistrationMetadata,
    didState: { state: 'failed', reason },
  }
}

/**
 * JSON with object keys sorted and empty arrays left out, to compare documents regardless of property order: the ledger
 * returns a document without its empty properties.
 */
function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item)
            .filter(([, property]) => !(Array.isArray(property) && property.length === 0))
            .sort(([a], [b]) => a.localeCompare(b)),
        )
      : item,
  )
}

export interface BuildDidDocumentOptions {
  method: 'indybesu'
  network: string
  endpoints?: IndyBesuEndpoint[]
}
