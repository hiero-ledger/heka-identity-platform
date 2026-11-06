import type { SetDidDocumentUpdateOptions } from '../did-registrar/set-did-document-update'
import type {
  DidCreateResult,
  DidDeactivateOptions,
  DidDeactivateResult,
  DidRegistrar,
  DidResolutionResult,
  DidUpdateResult,
} from '@credo-ts/core'
import type { IndyVdrDidCreateOptions } from '@credo-ts/indy-vdr'

import { parseIndyDid } from '@credo-ts/anoncreds'
import {
  AgentContext,
  deepEquality,
  DidDocument,
  DidDocumentBuilder,
  DidRecord,
  DidRepository,
  getPublicJwkFromVerificationMethod,
  JsonTransformer,
  Kms,
} from '@credo-ts/core'
import { IndyVdrIndyDidRegistrar, IndyVdrIndyDidResolver, IndyVdrPoolService } from '@credo-ts/indy-vdr'
import { CustomRequest, GetNymRequest, NymRequest } from '@hyperledger/indy-vdr-shared'

// The DID's own key; the ledger derives it from the NYM's verkey and it is the only key that can change the DID
export const VERKEY_FRAGMENT = '#verkey'

type IndyVdrPool = ReturnType<IndyVdrPoolService['getPoolForNamespace']>

/** The document the ledger derives from the NYM's verkey alone, as Credo's resolver builds it. */
export function indyBaseDidDocument(did: string, verkeyBase58: string): DidDocument {
  const verificationMethodId = `${did}${VERKEY_FRAGMENT}`
  return new DidDocumentBuilder(did)
    .addContext('https://w3id.org/security/suites/ed25519-2018/v1')
    .addVerificationMethod({
      id: verificationMethodId,
      type: 'Ed25519VerificationKey2018',
      controller: did,
      publicKeyBase58: verkeyBase58,
    })
    .addAuthentication(verificationMethodId)
    .build()
}

/**
 * Credo's did:indy registrar for creation, with update and deactivation.
 * - update: the NYM's `diddocContent` (the did:indy spec), everything the document holds beyond what the ledger derives
 *   from the verkey. The verkey is cannot be modified.
 * - deactivation: the verkey set to `null`. The DID can then no longer be changed, and its document no longer resolves.
 */
export class IndyDidRegistrar implements DidRegistrar {
  public readonly supportedMethods = ['indy']
  private readonly credoRegistrar = new IndyVdrIndyDidRegistrar()

  public create(agentContext: AgentContext, options: IndyVdrDidCreateOptions): Promise<DidCreateResult> {
    return this.credoRegistrar.create(agentContext, options)
  }

  public async update(agentContext: AgentContext, options: SetDidDocumentUpdateOptions): Promise<DidUpdateResult> {
    const { did } = options
    const didRepository = agentContext.dependencyManager.resolve(DidRepository)

    // The type allows only `setDidDocument`, but the options come through Credo's generic `DidsApi.update`
    const operation: string | undefined = options.didDocumentOperation
    if (operation && operation !== 'setDidDocument') {
      return failedResult(`did:indy replaces the whole document; '${operation}' is not supported`, NOT_SUBMITTED)
    }
    if (!(options.didDocument instanceof DidDocument) || options.didDocument.id !== did) {
      return failedResult('The new DID document must be a DidDocument of the DID', NOT_SUBMITTED)
    }
    const didDocument = options.didDocument

    let prepared: Awaited<ReturnType<typeof prepareNymWrite>>
    let diddocContent: string
    try {
      prepared = await prepareNymWrite(agentContext, did)
      const baseDocument = indyBaseDidDocument(did, prepared.verkey)
      const verkeyMethod = didDocument.verificationMethod?.find(({ id }) => id === `${did}${VERKEY_FRAGMENT}`)
      if (!verkeyMethod || verkeyMethod.publicKeyBase58 !== prepared.verkey) {
        return failedResult(`The key ${VERKEY_FRAGMENT} must stay in the document, unchanged`, NOT_SUBMITTED)
      }
      diddocContent = JSON.stringify(documentDiff(didDocument.toJSON(), baseDocument.toJSON()))
    } catch (error) {
      return failedResult(errorReason(error), NOT_SUBMITTED)
    }

    const { pool, namespaceIdentifier, signingKey, didRecord } = prepared
    let writeRequest: NymRequest
    try {
      const request = new NymRequest({ submitterDid: namespaceIdentifier, dest: namespaceIdentifier, diddocContent })
      writeRequest = await pool.prepareWriteRequest(agentContext, request, signingKey)
    } catch (error) {
      return failedResult(errorReason(error), NOT_SUBMITTED)
    }
    try {
      await pool.submitRequest(writeRequest)
    } catch (error) {
      // The transaction may have been written although its response was lost: the ledger decides
      const written = await readNym(pool, namespaceIdentifier)
        // Compared as JSON: indy-vdr re-serializes the content
        .then((nym) => !!nym?.diddocContent && deepEquality(JSON.parse(nym.diddocContent), JSON.parse(diddocContent)))
        .catch(() => false)
      if (!written) {
        return failedResult(errorReason(error))
      }
    }

    const keptKeys = (didRecord.keys ?? []).filter(({ didDocumentRelativeKeyId }) =>
      (didDocument.verificationMethod ?? []).some(({ id }) => id.endsWith(didDocumentRelativeKeyId)),
    )
    didRecord.didDocument = didDocument
    didRecord.keys = [...keptKeys, ...(options.secret?.keys ?? [])]
    await didRepository.update(agentContext, didRecord)

    return {
      didDocumentMetadata: {},
      didRegistrationMetadata: {},
      didState: { state: 'finished', did, didDocument },
    }
  }

  public async deactivate(agentContext: AgentContext, options: DidDeactivateOptions): Promise<DidDeactivateResult> {
    const { did } = options

    let prepared: Awaited<ReturnType<typeof prepareNymWrite>>
    let writeRequest: CustomRequest
    try {
      prepared = await prepareNymWrite(agentContext, did)
      const { namespaceIdentifier } = prepared
      // indy-vdr's NYM builder leaves out a missing verkey (no change), so `null` is set on the request body
      const body = JSON.parse(
        new NymRequest({ submitterDid: namespaceIdentifier, dest: namespaceIdentifier }).body,
      ) as {
        operation: Record<string, unknown>
      }
      body.operation.verkey = null
      writeRequest = await prepared.pool.prepareWriteRequest(
        agentContext,
        new CustomRequest({ customRequest: body }),
        prepared.signingKey,
      )
    } catch (error) {
      return failedResult(errorReason(error), NOT_SUBMITTED)
    }

    const { pool, namespaceIdentifier, didRecord } = prepared
    try {
      await pool.submitRequest(writeRequest)
    } catch (error) {
      const deactivated = await readNym(pool, namespaceIdentifier)
        .then((nym) => nym?.verkey === null)
        .catch(() => false)
      if (!deactivated) {
        return failedResult(errorReason(error))
      }
    }

    return {
      didDocumentMetadata: { deactivated: true },
      didRegistrationMetadata: {},
      didState: { state: 'finished', did, didDocument: didRecord.didDocument ?? new DidDocument({ id: did }) },
    }
  }
}

export class IndyDidResolver extends IndyVdrIndyDidResolver {
  public async resolve(agentContext: AgentContext, did: string): Promise<DidResolutionResult> {
    const result = await super.resolve(agentContext, did)
    if (result.didDocument) {
      return result
    }
    try {
      const { namespace, namespaceIdentifier } = parseIndyDid(did)
      const pool = agentContext.dependencyManager.resolve(IndyVdrPoolService).getPoolForNamespace(namespace)
      const nym = await readNym(pool, namespaceIdentifier)
      if (nym && nym.verkey === null) {
        return {
          didDocument: new DidDocument({ id: did }),
          didDocumentMetadata: { deactivated: true },
          didResolutionMetadata: { contentType: 'application/did+ld+json' },
        }
      }
    } catch {
      // The original failure is the answer
    }
    return result
  }
}

async function prepareNymWrite(agentContext: AgentContext, did: string) {
  const { namespace, namespaceIdentifier } = parseIndyDid(did)
  const didRecord: DidRecord | null = await agentContext.dependencyManager
    .resolve(DidRepository)
    .findCreatedDid(agentContext, did)
  const verkeyMethod = didRecord?.didDocument?.dereferenceKey(VERKEY_FRAGMENT)
  if (!didRecord || !verkeyMethod?.publicKeyBase58) {
    throw new Error('DID not found in this wallet')
  }

  const signingKey = getPublicJwkFromVerificationMethod(verkeyMethod)
  if (!signingKey.is(Kms.Ed25519PublicJwk)) {
    throw new Error(`The key ${VERKEY_FRAGMENT} is not an Ed25519 key`)
  }
  const key = didRecord.keys?.find(({ didDocumentRelativeKeyId }) => didDocumentRelativeKeyId === VERKEY_FRAGMENT)
  signingKey.keyId = key?.kmsKeyId ?? signingKey.legacyKeyId

  const pool = agentContext.dependencyManager.resolve(IndyVdrPoolService).getPoolForNamespace(namespace)
  return { didRecord, namespaceIdentifier, pool, signingKey, verkey: verkeyMethod.publicKeyBase58 }
}

async function readNym(
  pool: IndyVdrPool,
  namespaceIdentifier: string,
): Promise<{ verkey: string | null; diddocContent?: string } | null> {
  const response = await pool.submitRequest(new GetNymRequest({ dest: namespaceIdentifier }))
  const data = response.result.data
  return data ? (JSON.parse(data) as { verkey: string | null; diddocContent?: string }) : null
}

/** What `document` holds beyond `base`: array entries not in `base`, and other properties that differ. */
function documentDiff(document: Record<string, unknown>, base: Record<string, unknown>): Record<string, unknown> {
  const diff: Record<string, unknown> = {}
  for (const [property, value] of Object.entries(JsonTransformer.toJSON(document) as Record<string, unknown>)) {
    if (property === 'id') continue
    const baseValue = base[property]
    if (Array.isArray(value)) {
      const baseEntries = Array.isArray(baseValue) ? baseValue : baseValue === undefined ? [] : [baseValue]
      const added = value.filter((entry) => !baseEntries.some((baseEntry) => deepEquality(baseEntry, entry)))
      if (added.length) diff[property] = added
    } else if (!deepEquality(value, baseValue)) {
      diff[property] = value
    }
  }
  return diff
}

const NOT_SUBMITTED = { transactionSubmitted: false }

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

function errorReason(error: unknown): string {
  if (error instanceof Kms.KeyManagementError) {
    return 'A key of the DID is not available in the wallet'
  }
  return error instanceof Error ? error.message : String(error)
}
