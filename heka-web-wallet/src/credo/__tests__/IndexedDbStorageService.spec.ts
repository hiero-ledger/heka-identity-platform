import {
  GenericRecord,
  RecordDuplicateError,
  RecordNotFoundError,
  StorageVersionRecord,
  type AgentContext,
  type BaseRecord,
  type Query,
} from '@credo-ts/core'
import { beforeEach, describe, expect, it } from 'vitest'

import { IndexedDbStorageService } from '../IndexedDbStorageService'

const context = {} as AgentContext

describe('IndexedDbStorageService', () => {
  let storage: IndexedDbStorageService

  beforeEach(() => {
    storage = new IndexedDbStorageService(`heka-wallet-credo-${crypto.randomUUID()}`)
  })

  it('saves a record and reads it back', async () => {
    const record = new GenericRecord({
      id: 'rec-1',
      content: { vct: 'GithubContributorCredential' },
      tags: { vct: 'GithubContributorCredential' },
    })
    await storage.save(context, record)

    const loaded = await storage.getById(context, GenericRecord, 'rec-1')
    expect(loaded).toBeInstanceOf(GenericRecord)
    expect((loaded as GenericRecord).content).toEqual({ vct: 'GithubContributorCredential' })
  })

  it('rejects a duplicate save and a missing update', async () => {
    const record = new GenericRecord({ id: 'rec-1', content: { ok: true } })
    await storage.save(context, record)
    await expect(storage.save(context, record)).rejects.toBeInstanceOf(RecordDuplicateError)
    await expect(storage.update(context, new GenericRecord({ id: 'missing', content: {} }))).rejects.toBeInstanceOf(
      RecordNotFoundError,
    )
  })

  it('filters records by tag', async () => {
    await storage.save(context, new GenericRecord({ id: 'a', content: {}, tags: { vct: 'one' } }))
    await storage.save(context, new GenericRecord({ id: 'b', content: {}, tags: { vct: 'two' } }))

    const matches = await storage.findByQuery(context, GenericRecord, { vct: 'two' })
    expect(matches.map((record) => record.id)).toEqual(['b'])
  })

  it('stamps the current storage version when it creates the database', async () => {
    const record = await storage.getById(context, StorageVersionRecord, StorageVersionRecord.storageVersionRecordId)
    expect((record as StorageVersionRecord).storageVersion).toBe(StorageVersionRecord.frameworkStorageVersion)
  })

  it('leaves the storage version of an existing database alone', async () => {
    const name = `heka-wallet-credo-${crypto.randomUUID()}`
    const first = new IndexedDbStorageService(name)
    const id = StorageVersionRecord.storageVersionRecordId
    const record = (await first.getById(context, StorageVersionRecord, id)) as StorageVersionRecord
    record.storageVersion = '0.4'
    await first.update(context, record)

    const reopened = new IndexedDbStorageService(name)
    expect(((await reopened.getById(context, StorageVersionRecord, id)) as StorageVersionRecord).storageVersion).toBe(
      '0.4',
    )
  })

  it('saves only one of two concurrent records with the same id', async () => {
    const results = await Promise.allSettled([
      storage.save(context, new GenericRecord({ id: 'same', content: { first: true } })),
      storage.save(context, new GenericRecord({ id: 'same', content: { second: true } })),
    ])

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find((result) => result.status === 'rejected')
    expect(rejected?.status === 'rejected' && rejected.reason).toBeInstanceOf(RecordDuplicateError)
  })

  it('sets updatedAt on save and on update', async () => {
    const record = new GenericRecord({ id: 'u', content: {} })
    await storage.save(context, record)
    const saved = await storage.getById(context, GenericRecord, 'u')
    expect(saved.updatedAt).toBeInstanceOf(Date)
    const savedAt = saved.updatedAt!.getTime()

    await new Promise((resolve) => setTimeout(resolve, 5))
    await storage.update(context, saved)
    const updated = await storage.getById(context, GenericRecord, 'u')
    expect(updated.updatedAt!.getTime()).toBeGreaterThan(savedAt)
  })

  // The query shapes below are the ones Credo sends (DidRepository, DcqlService), with the results
  // Credo's InMemoryStorageService and Askar give for them.
  describe('query semantics', () => {
    const ids = (records: { id: string }[]) => records.map((record) => record.id).sort()
    const query = (value: unknown) => storage.findByQuery(context, GenericRecord, value as Query<BaseRecord>)

    beforeEach(async () => {
      await storage.save(
        context,
        new GenericRecord({
          id: 'created',
          content: {},
          tags: { did: 'did:x:1', role: 'created', method: 'x', alternativeDids: ['did:x:alt', 'did:x:alt2'] },
        }),
      )
      await storage.save(
        context,
        new GenericRecord({ id: 'received', content: {}, tags: { did: 'did:x:1', role: 'received', method: 'x' } }),
      )
      await storage.save(
        context,
        new GenericRecord({ id: 'other', content: {}, tags: { did: 'did:y:1', role: 'received', method: 'y' } }),
      )
    })

    it('ANDs the simple keys with $or (DidRepository.findCreatedDid)', async () => {
      expect(
        ids(await query({ $or: [{ alternativeDids: ['did:x:1'] }, { did: 'did:x:1' }], role: 'created' })),
      ).toEqual(['created'])
    })

    it('ANDs the simple keys with $and', async () => {
      expect(ids(await query({ $and: [{ method: 'x' }], role: 'received' }))).toEqual(['received'])
    })

    it('negates $not and ANDs it with the simple keys', async () => {
      expect(ids(await query({ $not: { role: 'created' }, did: 'did:x:1' }))).toEqual(['received'])
    })

    it('needs every member of an array value in the array tag', async () => {
      expect(ids(await query({ alternativeDids: ['did:x:alt'] }))).toEqual(['created'])
      expect(ids(await query({ alternativeDids: ['did:x:alt', 'did:x:alt2'] }))).toEqual(['created'])
      expect(ids(await query({ alternativeDids: ['did:x:alt', 'did:x:other'] }))).toEqual([])
      expect(ids(await query({ role: ['created'] }))).toEqual([])
    })

    it('skips undefined values (DidRepository.getCreatedDids({}))', async () => {
      expect(ids(await query({ role: 'created', method: undefined, $or: undefined }))).toEqual(['created'])
    })

    it('applies offset and limit after the query', async () => {
      expect(
        await storage.findByQuery(context, GenericRecord, { did: 'did:x:1' }, { offset: 1, limit: 1 }),
      ).toHaveLength(1)
    })
  })
})
