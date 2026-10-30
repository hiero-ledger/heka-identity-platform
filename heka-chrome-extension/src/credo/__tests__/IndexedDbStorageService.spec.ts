import { GenericRecord, RecordDuplicateError, RecordNotFoundError, type AgentContext } from '@credo-ts/core'
import { beforeEach, describe, expect, it } from 'vitest'

import { IndexedDbStorageService } from '../IndexedDbStorageService'

const context = {} as AgentContext

describe('IndexedDbStorageService', () => {
  let storage: IndexedDbStorageService

  beforeEach(() => {
    storage = new IndexedDbStorageService(`heka-wallet-credo-${crypto.randomUUID()}`)
  })

  it('saves a record and reads it back', async () => {
    const record = new GenericRecord({ id: 'rec-1', content: { vct: 'GithubContributorCredential' }, tags: { vct: 'GithubContributorCredential' } })
    await storage.save(context, record)

    const loaded = await storage.getById(context, GenericRecord, 'rec-1')
    expect(loaded).toBeInstanceOf(GenericRecord)
    expect((loaded as GenericRecord).content).toEqual({ vct: 'GithubContributorCredential' })
  })

  it('rejects a duplicate save and a missing update', async () => {
    const record = new GenericRecord({ id: 'rec-1', content: { ok: true } })
    await storage.save(context, record)
    await expect(storage.save(context, record)).rejects.toBeInstanceOf(RecordDuplicateError)
    await expect(storage.update(context, new GenericRecord({ id: 'missing', content: {} }))).rejects.toBeInstanceOf(RecordNotFoundError)
  })

  it('filters records by tag', async () => {
    await storage.save(context, new GenericRecord({ id: 'a', content: {}, tags: { vct: 'one' } }))
    await storage.save(context, new GenericRecord({ id: 'b', content: {}, tags: { vct: 'two' } }))

    const matches = await storage.findByQuery(context, GenericRecord, { vct: 'two' })
    expect(matches.map((record) => record.id)).toEqual(['b'])
  })
})
