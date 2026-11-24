import { StorageVersionRecord, type AgentContext } from '@credo-ts/core'
import { describe, expect, it, vi } from 'vitest'

import { IndexedDbStorageService } from '../IndexedDbStorageService'

describe('getOrCreateAgent', () => {
  it('starts a fresh wallet without a storage migration', async () => {
    const { getOrCreateAgent } = await import('../lazy-agent')
    const agent = await getOrCreateAgent()

    expect(agent.isInitialized).toBe(true)
    expect(agent.config.autoUpdateStorageOnStartup).toBe(false)
  })

  it('refuses to start on older storage instead of migrating the only copy of the wallet', async () => {
    const storage = new IndexedDbStorageService('heka-wallet-credo')
    const context = {} as AgentContext
    const id = StorageVersionRecord.storageVersionRecordId
    const record = (await storage.getById(context, StorageVersionRecord, id)) as StorageVersionRecord
    record.storageVersion = '0.4'
    await storage.update(context, record)

    vi.resetModules()
    const { getOrCreateAgent } = await import('../lazy-agent')
    await expect(getOrCreateAgent()).rejects.toThrow(/not up to date/)
    const after = (await storage.getById(context, StorageVersionRecord, id)) as StorageVersionRecord
    expect(after.storageVersion).toBe('0.4')
  })
})
