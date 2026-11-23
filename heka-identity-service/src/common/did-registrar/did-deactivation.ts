import type { DidDocument, DidDocumentMetadata, DidRecord, DidResolutionResult } from '@credo-ts/core'

import { DidRepository, tryParseDid } from '@credo-ts/core'
import { UnprocessableEntityException } from '@nestjs/common'

import { TenantAgent } from '../agent'

export const DID_DEACTIVATED_TAG = 'hekaDeactivated'

export function isDidRecordDeactivated(didRecord: DidRecord): boolean {
  return didRecord.getTag(DID_DEACTIVATED_TAG) === true
}

export async function isStoredDidDeactivated(tenantAgent: TenantAgent, did: string): Promise<boolean> {
  const didRecords = await tenantAgent.dids.getCreatedDids({ did: tryParseDid(did)?.did ?? did })
  return didRecords.some(isDidRecordDeactivated)
}

export async function assertDidActive(
  tenantAgent: TenantAgent,
  did: string,
  didDocumentMetadata?: DidDocumentMetadata,
): Promise<void> {
  if (didDocumentMetadata?.deactivated === true || (await isStoredDidDeactivated(tenantAgent, did))) {
    throw new UnprocessableEntityException(`DID is deactivated: ${did}`)
  }
}

export async function assertDidActiveOnLedger(tenantAgent: TenantAgent, did: string): Promise<void> {
  await resolveActiveOnLedger(tenantAgent, did)
}

/**
 * The DID's document as its ledger has it now, for an OpenID4VC offer or request: one uncached read serves both the
 * deactivation check and the choice of the signing key, so the key is one verifiers can see. A deactivated DID is
 * refused (422). When the ledger cannot be read, the wallet decides, as before: its deactivation tag and the default
 * resolution (the resolver cache or the wallet's record). `null` when no document can be had at all.
 */
export async function resolveActiveDidDocument(tenantAgent: TenantAgent, did: string): Promise<DidDocument | null> {
  const resolution = await resolveActiveOnLedger(tenantAgent, did)
  if (resolution?.didDocument) {
    return resolution.didDocument
  }
  const { didDocument } = await tenantAgent.dids.resolve(tryParseDid(did)?.did ?? did)
  return didDocument
}

async function resolveActiveOnLedger(tenantAgent: TenantAgent, did: string): Promise<DidResolutionResult | undefined> {
  const baseDid = tryParseDid(did)?.did ?? did
  let resolution: DidResolutionResult | undefined
  try {
    resolution = await tenantAgent.dids.resolve(baseDid, { useCache: false, useLocalCreatedDidRecord: false })
  } catch {
    tenantAgent.config.logger.warn('Could not resolve the DID from its ledger; checking the wallet only', { did })
  }
  if (resolution?.didDocumentMetadata?.deactivated === true) {
    await tagStoredDidDeactivated(tenantAgent, baseDid)
  }
  await assertDidActive(tenantAgent, did, resolution?.didDocumentMetadata)
  return resolution
}

/**
 * Tries to tag stored did as deactivated. Does not throw on fail.
 */
async function tagStoredDidDeactivated(tenantAgent: TenantAgent, did: string): Promise<void> {
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
