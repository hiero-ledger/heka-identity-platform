import { Metadata, type Agent, type SdJwtVcRecord } from '@credo-ts/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { OPENID4VC_CREDENTIAL_METADATA_KEY } from '../../oid4vci/credential-display'
import { CREDENTIAL_COUNT_KEY, CREDENTIALS_SUMMARY_KEY } from '../storage-keys'
import { loadCredentialSummaries, syncCredentialSummaryCache } from '../summary-cache'

describe('credential summary cache', () => {
  const store = new Map<string, unknown>()

  beforeEach(() => {
    store.clear()
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: async (key: string) => ({ [key]: store.get(key) }),
          set: async (values: Record<string, unknown>) => {
            for (const [key, value] of Object.entries(values)) store.set(key, value)
          },
        },
      },
    })
  })

  it('writes the popup summary from stored SD-JWT records', async () => {
    const metadata = new Metadata({})
    metadata.set(OPENID4VC_CREDENTIAL_METADATA_KEY, {
      credential: { name: 'GitHub Contributor Credential', backgroundColor: '#1a1a2e', textColor: '#ffffff' },
      issuer: { id: 'https://issuer.example', name: 'Example Issuer' },
    })
    const record = {
      id: 'cred-1',
      createdAt: new Date('2026-11-24T09:00:00.000Z'),
      metadata,
      getTags: () => ({ vct: 'https://hiero.ledger.org/vct/GithubContributorCredential' }),
      firstCredential: {
        payload: { iss: 'did:key:z6MkIssuer', iat: Date.parse('2026-10-30T00:00:00.000Z') / 1000 },
        prettyClaims: { githubUsername: 'octocat', gpgFingerprint: 'AABB' },
      },
    } as unknown as SdJwtVcRecord
    const agent = {
      sdJwtVc: { getAll: async () => [record] },
    } as unknown as Agent

    await syncCredentialSummaryCache(agent)

    expect(store.get(CREDENTIAL_COUNT_KEY)).toBe(1)
    await expect(loadCredentialSummaries()).resolves.toEqual([
      {
        id: 'cred-1',
        vct: 'https://hiero.ledger.org/vct/GithubContributorCredential',
        issuer: 'did:key:z6MkIssuer',
        issuerName: 'Example Issuer',
        issuedAt: '2026-10-30T00:00:00.000Z',
        display: { name: 'GitHub Contributor Credential', backgroundColor: '#1a1a2e', textColor: '#ffffff' },
      },
    ])
    expect(JSON.stringify(store.get(CREDENTIALS_SUMMARY_KEY))).not.toContain('octocat')
    expect(JSON.stringify(store.get(CREDENTIALS_SUMMARY_KEY))).not.toContain('AABB')
  })

  it('summarises a record without display metadata or iat (received before they were kept)', async () => {
    const record = {
      id: 'cred-2',
      createdAt: new Date('2026-11-24T09:00:00.000Z'),
      metadata: new Metadata({}),
      getTags: () => ({ vct: 'https://issuer.example/vct/Plain' }),
      firstCredential: { payload: { iss: 'did:key:z6MkIssuer' }, prettyClaims: {} },
    } as unknown as SdJwtVcRecord

    await syncCredentialSummaryCache({ sdJwtVc: { getAll: async () => [record] } } as unknown as Agent)

    await expect(loadCredentialSummaries()).resolves.toEqual([
      { id: 'cred-2', vct: 'https://issuer.example/vct/Plain', issuer: 'did:key:z6MkIssuer' },
    ])
  })
})
