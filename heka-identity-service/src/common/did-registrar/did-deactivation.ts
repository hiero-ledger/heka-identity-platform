import type { DidDocumentMetadata, DidRecord } from '@credo-ts/core'

import { DidRepository, tryParseDid } from '@credo-ts/core'
import { UnprocessableEntityException } from '@nestjs/common'

import { TenantAgent } from '../agent'

/**
 * Tag set on the `DidRecord` of a DID that its wallet deactivated. The ledgers record the deactivation too, but the own
 * DID of a wallet is often resolved from its `DidRecord` (did:hedera), which carries no resolution metadata.
 */
export const DID_DEACTIVATED_TAG = 'hekaDeactivated'

export function isDidRecordDeactivated(didRecord: DidRecord): boolean {
  return didRecord.getTag(DID_DEACTIVATED_TAG) === true
}

/** Whether `did` (or the DID of a DID URL) is a DID of the tenant's wallet that the wallet deactivated. */
export async function isOwnDidDeactivated(tenantAgent: TenantAgent, did: string): Promise<boolean> {
  const didRecords = await tenantAgent.dids.getCreatedDids({ did: tryParseDid(did)?.did ?? did })
  return didRecords.some(isDidRecordDeactivated)
}

/**
 * Rejects a deactivated DID before it is used to sign or register anything new: deactivated on its ledger (per the
 * resolution metadata, when given) or by the tenant's wallet.
 */
export async function assertDidNotDeactivated(
  tenantAgent: TenantAgent,
  did: string,
  didDocumentMetadata?: DidDocumentMetadata,
): Promise<void> {
  if (didDocumentMetadata?.deactivated === true || (await isOwnDidDeactivated(tenantAgent, did))) {
    throw new UnprocessableEntityException(`DID is deactivated: ${did}`)
  }
}

/**
 * `assertDidNotDeactivated` for a registration (AnonCreds schema or credential definition, schema-v2): also asks the
 * DID's ledger, uncached and not from the wallet's record, so a DID deactivated on its ledger but not tagged by the wallet
 * (a deactivation whose response was lost) is rejected too. A DID of the wallet found deactivated this way gets the tag.
 *
 * A failed resolution falls back to the tag check: an unreachable resolver does not block a registration, which goes to
 * the ledger anyway.
 */
export async function assertDidNotDeactivatedOnLedger(tenantAgent: TenantAgent, did: string): Promise<void> {
  const baseDid = tryParseDid(did)?.did ?? did
  let didDocumentMetadata: DidDocumentMetadata | undefined
  try {
    const resolution = await tenantAgent.dids.resolve(baseDid, { useCache: false, useLocalCreatedDidRecord: false })
    didDocumentMetadata = resolution.didDocumentMetadata
  } catch {
    tenantAgent.config.logger.warn('Could not resolve the DID from its ledger; checking the wallet only', { did })
  }
  if (didDocumentMetadata?.deactivated === true) {
    await tagOwnDidDeactivated(tenantAgent, baseDid)
  }
  await assertDidNotDeactivated(tenantAgent, did, didDocumentMetadata)
}

/**
 * Best effort: the caller rejects the DID either way, so a failed write is only logged. Runs without the wallet lock of
 * `DidService` and only adds the tag to a record read just before: once the ledger shows the DID deactivated, updates
 * and deactivations stop writing its record. The one overlap is a deactivation still in flight; should its registrar
 * store the record between this read and write, that document change is lost, while the tag holds either way.
 */
async function tagOwnDidDeactivated(tenantAgent: TenantAgent, did: string): Promise<void> {
  try {
    const didRecords = await tenantAgent.dids.getCreatedDids({ did })
    const untagged = didRecords.filter((didRecord) => !isDidRecordDeactivated(didRecord))
    for (const didRecord of untagged) {
      didRecord.setTag(DID_DEACTIVATED_TAG, true)
      await tenantAgent.dependencyManager.resolve(DidRepository).update(tenantAgent.context, didRecord)
    }
  } catch {
    tenantAgent.config.logger.warn('Could not record the ledger deactivation of the DID in the wallet', { did })
  }
}
