import type { DidDocumentKey, DidUpdateOptions, DidUpdateResult } from '@credo-ts/core'

import { DidDocument, getEd25519VerificationKey2020, JsonTransformer, Kms, parseDid } from '@credo-ts/core'

import { TenantAgent } from '../agent'

import { fragmentOf, UpdateDidOptions, VERIFICATION_PURPOSES, VERIFICATION_RELATIONSHIPS } from './did-registrar.types'

const ED25519_2020_CONTEXT = 'https://w3id.org/security/suites/ed25519-2020/v1'

type DidDocumentJson = Record<string, unknown> & { '@context'?: string | string[] }
type RelationshipEntry = string | { id: string }

/**
 * The options of a Credo registrar that writes a whole new document (did:indybesu, did:indy). A failed result reports
 * `didRegistrationMetadata.transactionSubmitted: false` when certainly nothing was sent to the ledger.
 */
export interface SetDidDocumentUpdateOptions extends DidUpdateOptions {
  didDocumentOperation?: 'setDidDocument'
  didDocument: DidDocument
  secret?: {
    // Keys of verification methods new in the document
    keys?: DidDocumentKey[]
  }
  options?: {
    // did:indy: the endorser that also signs the update
    endorserDid?: string
  }
}

export async function updateBySettingDidDocument(
  tenantAgent: TenantAgent,
  options: UpdateDidOptions,
  registrarOptions?: SetDidDocumentUpdateOptions['options'],
): Promise<DidUpdateResult> {
  const { did, currentDidDocument } = options
  const createdKeys: DidDocumentKey[] = []
  let submittedToLedger = false
  try {
    const json = JsonTransformer.toJSON(currentDidDocument) as DidDocumentJson
    const entryId = (entry: RelationshipEntry) => (typeof entry === 'string' ? entry : entry.id)
    const removedServices = new Set(options.removeServices)
    const removedKeys = new Set(options.removeVerificationMethods)

    json.service = [
      ...((json.service as Array<{ id: string }> | undefined) ?? []).filter(
        ({ id }) => !removedServices.has(fragmentOf(id)),
      ),
      ...options.addServices.map(({ id, type, serviceEndpoint }) => ({ id: `${did}${id}`, type, serviceEndpoint })),
    ]
    json.verificationMethod = ((json.verificationMethod as Array<{ id: string }> | undefined) ?? []).filter(
      ({ id }) => !removedKeys.has(fragmentOf(id)),
    )
    for (const relationship of VERIFICATION_RELATIONSHIPS) {
      json[relationship] = ((json[relationship] as RelationshipEntry[] | undefined) ?? []).filter(
        (entry) => !removedKeys.has(fragmentOf(entryId(entry))),
      )
    }

    for (const { id, purposes } of options.addVerificationMethods) {
      const { keyId, publicJwk } = await tenantAgent.kms.createKey({ type: { kty: 'OKP', crv: 'Ed25519' } })
      createdKeys.push({ kmsKeyId: keyId, didDocumentRelativeKeyId: id })
      const verificationMethod = getEd25519VerificationKey2020({
        id: `${did}${id}`,
        controller: did,
        publicJwk: Kms.PublicJwk.fromPublicJwk(publicJwk),
      })
      // Appended, so the owner key stays first: signing picks the first verification method
      json.verificationMethod = [...(json.verificationMethod as unknown[]), JsonTransformer.toJSON(verificationMethod)]
      for (const purpose of VERIFICATION_PURPOSES.filter((purpose) => purposes.includes(purpose))) {
        json[purpose] = [...(json[purpose] as RelationshipEntry[]), verificationMethod.id]
      }
    }

    if (options.addVerificationMethods.length) {
      const context = json['@context'] ?? []
      const contexts = Array.isArray(context) ? context : [context]
      if (!contexts.some((entry) => entry === ED25519_2020_CONTEXT)) {
        json['@context'] = [...contexts, ED25519_2020_CONTEXT]
      }
    }

    submittedToLedger = true
    const result = await tenantAgent.dids.update<SetDidDocumentUpdateOptions>({
      did,
      didDocumentOperation: 'setDidDocument',
      didDocument: JsonTransformer.fromJSON(json, DidDocument),
      secret: { keys: createdKeys },
      options: registrarOptions,
    })
    if (result.didState.state !== 'finished') {
      await releaseKeys(tenantAgent, createdKeys, result.didRegistrationMetadata.transactionSubmitted === false, did)
    }
    return result
  } catch (error) {
    await releaseKeys(tenantAgent, createdKeys, !submittedToLedger, did)
    return {
      didDocumentMetadata: {},
      didRegistrationMetadata: {},
      didState: { state: 'failed', reason: `Unable to update DID: ${(error as Error).message}` },
    }
  }
}

/**
 * The keys created for a failed update are deleted only when nothing was sent to the ledger.
 * A transaction that was sent but not confirmed (receipt error or timeout) are kept.
 */
async function releaseKeys(
  tenantAgent: TenantAgent,
  keys: DidDocumentKey[],
  nothingSubmitted: boolean,
  did: string,
): Promise<void> {
  if (!keys.length) {
    return
  }
  if (!nothingSubmitted) {
    tenantAgent.config.logger.warn(
      `did:${parseDid(did).method} update failed after its transaction may have been sent; ${keys.length} new key(s) are kept in the wallet`,
    )
    return
  }
  for (const key of keys) {
    await tenantAgent.kms.deleteKey({ keyId: key.kmsKeyId }).catch(() => undefined)
  }
}
