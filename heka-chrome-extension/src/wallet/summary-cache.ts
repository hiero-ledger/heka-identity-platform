import type { Agent } from '@credo-ts/core'

import { CREDENTIAL_COUNT_KEY, CREDENTIALS_SUMMARY_KEY } from './storage-keys'

export interface CredentialSummary {
  id: string
  vct: string
  issuer: string
  issuedAt?: string
}

export async function syncCredentialSummaryCache(agent: Agent): Promise<void> {
  const records = await agent.sdJwtVc.getAll()
  const summary: CredentialSummary[] = records.map((record) => {
    const issuer = record.firstCredential.payload.iss
    return {
      id: record.id,
      vct: record.getTags().vct,
      issuer: typeof issuer === 'string' ? issuer : '',
      issuedAt: record.createdAt ? record.createdAt.toISOString() : undefined,
    }
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
