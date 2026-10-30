import type { Agent, SdJwtVcRecord } from '@credo-ts/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
    const record = {
      id: 'cred-1',
      createdAt: new Date('2026-10-30T00:00:00.000Z'),
      getTags: () => ({ vct: 'https://hiero.ledger.org/vct/GithubContributorCredential' }),
      firstCredential: {
        payload: { iss: 'https://issuer.example' },
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
        issuer: 'https://issuer.example',
        issuedAt: '2026-10-30T00:00:00.000Z',
      },
    ])
    expect(JSON.stringify(store.get(CREDENTIALS_SUMMARY_KEY))).not.toContain('octocat')
    expect(JSON.stringify(store.get(CREDENTIALS_SUMMARY_KEY))).not.toContain('AABB')
  })
})
