import type { DidCreateResult, DidDeactivateResult, DidDocumentKey, DidUpdateResult } from '@credo-ts/core'

import {
  DidDocument,
  DidDocumentService,
  DidRepository,
  getEd25519VerificationKey2020,
  Kms,
  VerificationMethod,
} from '@credo-ts/core'
import { HederaDidCreateOptions, HederaDidUpdateOptions } from '@credo-ts/hedera'
import { UnprocessableEntityException } from '@nestjs/common'

import { TenantAgent } from '../../agent'
import {
  CreateDidOptions,
  DidRegistrar,
  fragmentOf,
  UpdateDidOptions,
  VERIFICATION_PURPOSES,
  VERIFICATION_RELATIONSHIPS,
} from '../did-registrar.types'

export class DidHederaRegistrar implements DidRegistrar {
  public static readonly method = 'hedera'

  public readonly supportsController = true

  public readonly protectedKeyFragment = '#did-root-key'

  public createDid(tenantAgent: TenantAgent, options: CreateDidOptions): Promise<DidCreateResult> {
    return tenantAgent.dids.create<HederaDidCreateOptions>({
      method: DidHederaRegistrar.method,
      // Credo takes the controller from the DID document; the DID's own id is assigned on creation
      // (see `HekaHederaLedgerService`)
      didDocument: options.controller ? new DidDocument({ id: '', controller: [options.controller] }) : undefined,
    })
  }

  public async updateDid(tenantAgent: TenantAgent, options: UpdateDidOptions): Promise<DidUpdateResult> {
    const { did, currentDidDocument } = options
    assertRemovableVerificationMethods(currentDidDocument, options.removeVerificationMethods)
    const createdKeys: DidDocumentKey[] = []
    // Set once an update is handed to Credo: from then on HCS messages may have been sent
    let submitted = false

    try {
      let result: DidUpdateResult | undefined

      if (options.addServices.length || options.addVerificationMethods.length) {
        const verificationMethods: Array<{ verificationMethod: VerificationMethod; purposes: string[] }> = []
        for (const { id, purposes } of options.addVerificationMethods) {
          const { keyId, publicJwk } = await tenantAgent.kms.createKey({ type: { kty: 'OKP', crv: 'Ed25519' } })
          createdKeys.push({ kmsKeyId: keyId, didDocumentRelativeKeyId: id })
          verificationMethods.push({
            verificationMethod: getEd25519VerificationKey2020({
              id,
              controller: did,
              publicJwk: Kms.PublicJwk.fromPublicJwk(publicJwk),
            }),
            purposes,
          })
        }

        // Relationships carry the full verification method: the SDK prepares every message against the document
        // before the update, where the new key does not exist yet
        const relationships = Object.fromEntries(
          VERIFICATION_PURPOSES.map((purpose) => [
            purpose,
            nonEmpty(
              verificationMethods
                .filter(({ purposes }) => purposes.includes(purpose))
                .map(({ verificationMethod }) => verificationMethod),
            ),
          ]),
        )

        submitted = true
        result = await tenantAgent.dids.update<HederaDidUpdateOptions>({
          did,
          didDocumentOperation: 'addToDidDocument',
          didDocument: new DidDocument({
            id: did,
            verificationMethod: nonEmpty(verificationMethods.map(({ verificationMethod }) => verificationMethod)),
            service: nonEmpty(options.addServices.map((service) => new DidDocumentService(service))),
            ...relationships,
          }),
          secret: { keys: createdKeys },
        })
        if (result.didState.state !== 'finished') {
          await this.afterFailedUpdate(tenantAgent, did, createdKeys, submitted)
          return result
        }
      }

      if (options.removeServices.length || options.removeVerificationMethods.length) {
        const removedServices = new Set(options.removeServices)
        const removedKeys = new Set(options.removeVerificationMethods)
        const refersToRemovedKey = (entry: string | VerificationMethod) =>
          removedKeys.has(fragmentOf(typeof entry === 'string' ? entry : entry.id))

        submitted = true
        result = await tenantAgent.dids.update<HederaDidUpdateOptions>({
          did,
          didDocumentOperation: 'removeFromDidDocument',
          didDocument: new DidDocument({
            id: did,
            service: nonEmpty(
              (currentDidDocument.service ?? []).filter((service) => removedServices.has(fragmentOf(service.id))),
            ),
            verificationMethod: nonEmpty((currentDidDocument.verificationMethod ?? []).filter(refersToRemovedKey)),
            ...Object.fromEntries(
              VERIFICATION_RELATIONSHIPS.map((relationship) => [
                relationship,
                nonEmpty((currentDidDocument[relationship] ?? []).filter(refersToRemovedKey)),
              ]),
            ),
          }),
        })
        if (result.didState.state !== 'finished') {
          await this.afterFailedUpdate(tenantAgent, did, createdKeys, submitted)
          return result
        }
      }

      return result!
    } catch (error) {
      await this.afterFailedUpdate(tenantAgent, did, createdKeys, submitted)
      return {
        didDocumentMetadata: {},
        didRegistrationMetadata: {},
        // A KMS error names the KMS key id, which is not passed on
        didState: {
          state: 'failed',
          reason: `Unable to update DID: ${error instanceof Kms.KeyManagementError ? 'key management error' : (error as Error).message}`,
        },
      }
    }
  }

  /** Deactivation keeps the keys: AnonCreds revocation topics of the DID are bound to its root key. */
  public deactivateDid(tenantAgent: TenantAgent, did: string): Promise<DidDeactivateResult> {
    return tenantAgent.dids.deactivate({ did })
  }

  /**
   * Cleanup after a failed update. The new keys are deleted only when nothing was sent to the ledger
   * (the failure came from the KMS, before any update was handed to Credo).
   */
  private async afterFailedUpdate(
    tenantAgent: TenantAgent,
    did: string,
    createdKeys: DidDocumentKey[],
    submitted: boolean,
  ): Promise<void> {
    if (!submitted) {
      for (const key of createdKeys) {
        await tenantAgent.kms.deleteKey({ keyId: key.kmsKeyId }).catch(() => undefined)
      }
      return
    }
    // The failure of the update is what the caller gets to see, not a failure of this clean-up
    const notVisible = await this.syncDidRecordFromLedger(tenantAgent, did, createdKeys).catch(() => createdKeys.length)
    if (notVisible > 0) {
      // Key ids are not logged
      tenantAgent.config.logger.warn(
        `did:hedera update failed after messages were sent; ${notVisible} new key(s) not visible on the ledger yet are kept in the wallet`,
      )
    }
  }

  /** Returns how many of the new keys the ledger does not show. */
  private async syncDidRecordFromLedger(
    tenantAgent: TenantAgent,
    did: string,
    createdKeys: DidDocumentKey[],
  ): Promise<number> {
    const { didDocument } = await tenantAgent.dids
      .resolve(did, { useCache: false, useLocalCreatedDidRecord: false })
      .catch(() => ({ didDocument: null }))
    // Without the ledger state the record is left as it is
    if (!didDocument) {
      return createdKeys.length
    }

    const isOnLedger = (key: DidDocumentKey) =>
      (didDocument.verificationMethod ?? []).some((verificationMethod) =>
        verificationMethod.id.endsWith(key.didDocumentRelativeKeyId),
      )
    const notVisible = createdKeys.filter((key) => !isOnLedger(key)).length

    const didRepository = tenantAgent.dependencyManager.resolve(DidRepository)
    const didRecord = await didRepository.findCreatedDid(tenantAgent.context, did)
    if (!didRecord) {
      return notVisible
    }
    const keys = didRecord.keys ?? []
    didRecord.didDocument = didDocument
    didRecord.keys = [
      ...keys,
      ...createdKeys.filter(
        (key) => isOnLedger(key) && !keys.some((k) => k.didDocumentRelativeKeyId === key.didDocumentRelativeKeyId),
      ),
    ]
    await didRepository.update(tenantAgent.context, didRecord)
    return notVisible
  }
}

/**
 * hiero-did-sdk 0.1.8 cannot remove a verification relationship that references a verification method by id
 * and leaves a dangling reference.
 */
function assertRemovableVerificationMethods(didDocument: DidDocument, fragments: string[]): void {
  for (const fragment of fragments) {
    const referencedFrom = VERIFICATION_RELATIONSHIPS.filter((relationship) =>
      (didDocument[relationship] ?? []).some(
        (entry) => fragmentOf(typeof entry === 'string' ? entry : entry.id) === fragment,
      ),
    )
    if (referencedFrom.length) {
      throw new UnprocessableEntityException(
        `did:hedera cannot remove ${fragment} while it is referenced from ${referencedFrom.join(', ')}: ` +
          'the Hedera DID SDK would leave a dangling reference. Only keys added without purposes can be removed',
      )
    }
  }
}

function nonEmpty<T>(items: T[]): T[] | undefined {
  return items.length ? items : undefined
}
