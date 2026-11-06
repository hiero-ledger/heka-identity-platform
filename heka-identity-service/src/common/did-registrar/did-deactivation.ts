import type { DidDocumentMetadata, DidRecord } from '@credo-ts/core'

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
  const baseDid = tryParseDid(did)?.did ?? did
  let didDocumentMetadata: DidDocumentMetadata | undefined
  try {
    const resolution = await tenantAgent.dids.resolve(baseDid, { useCache: false, useLocalCreatedDidRecord: false })
    didDocumentMetadata = resolution.didDocumentMetadata
  } catch {
    tenantAgent.config.logger.warn('Could not resolve the DID from its ledger; checking the wallet only', { did })
  }
  if (didDocumentMetadata?.deactivated === true) {
    await tagStoredDidDeactivated(tenantAgent, baseDid)
  }
  await assertDidActive(tenantAgent, did, didDocumentMetadata)
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
