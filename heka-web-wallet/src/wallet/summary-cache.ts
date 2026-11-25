import type { Agent } from '@credo-ts/core'

import {
  OPENID4VC_CREDENTIAL_METADATA_KEY,
  type CredentialDisplay,
  type OpenId4VcCredentialMetadata,
} from '../oid4vci/credential-display'
import { CREDENTIAL_COUNT_KEY, CREDENTIALS_SUMMARY_KEY } from './storage-keys'

/** What the popup shows without loading Credo. No claim values. */
export interface CredentialSummary {
  id: string
  vct: string
  /** The `iss` the credential is signed by. */
  issuer: string
  /** The issuer's display name from its metadata, kept at receive. */
  issuerName?: string
  /** The credential's `iat`. */
  issuedAt?: string
  display?: CredentialDisplay
}

export async function syncCredentialSummaryCache(agent: Agent): Promise<void> {
  const records = await agent.sdJwtVc.getAll()
  const summary: CredentialSummary[] = records.map((record) => {
    const { iss, iat } = record.firstCredential.payload
    const metadata = record.metadata.get(OPENID4VC_CREDENTIAL_METADATA_KEY) as OpenId4VcCredentialMetadata | null
    const entry: CredentialSummary = {
      id: record.id,
      vct: record.getTags().vct,
      issuer: typeof iss === 'string' ? iss : '',
    }
    if (metadata?.issuer.name) entry.issuerName = metadata.issuer.name
    if (typeof iat === 'number') entry.issuedAt = new Date(iat * 1000).toISOString()
    if (metadata?.credential) entry.display = metadata.credential
    return entry
  })

  await chrome.storage.local.set({
    [CREDENTIALS_SUMMARY_KEY]: summary,
    [CREDENTIAL_COUNT_KEY]: summary.length,
  })
}

export async function loadCredentialSummaries(): Promise<CredentialSummary[]> {
  const stored = await chrome.storage.local.get(CREDENTIALS_SUMMARY_KEY)
  const summary = stored[CREDENTIALS_SUMMARY_KEY]
  return Array.isArray(summary) ? (summary as CredentialSummary[]) : []
}
