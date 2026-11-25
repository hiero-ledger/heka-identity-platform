import {
  JsonTransformer,
  RecordDuplicateError,
  RecordNotFoundError,
  StorageVersionRecord,
  type AgentContext,
  type BaseRecord,
  type BaseRecordConstructor,
  type Query,
  type QueryOptions,
  type StorageService,
} from '@credo-ts/core'

interface StoredRecord {
  key: string
  type: string
  id: string
  json: Record<string, unknown>
  tags: Record<string, unknown>
}

export class IndexedDbStorageService implements StorageService<BaseRecord> {
  public readonly supportsCursorPagination = false

  private readonly dbPromise: Promise<IDBDatabase>

  public constructor(dbName = 'heka-wallet-credo') {
    this.dbPromise = openDatabase(dbName)
  }

  public async save(_agentContext: AgentContext, record: BaseRecord): Promise<void> {
    record.updatedAt = new Date()
    const db = await this.dbPromise
    try {
      // add() rejects an existing key in the same transaction as the write.
      await runRequest(db, 'readwrite', (store) => store.add(toStoredRecord(record)))
    } catch (error) {
      if ((error as { name?: unknown } | null)?.name !== 'ConstraintError') throw error
      throw new RecordDuplicateError(`Record of type '${record.type}' with id '${record.id}' already exists`, {
        recordType: record.type,
      })
    }
  }

  public async update(_agentContext: AgentContext, record: BaseRecord): Promise<void> {
    const existing = await this.findRawById(record.type, record.id)
    if (!existing) {
      throw new RecordNotFoundError(`Record of type '${record.type}' with id '${record.id}' not found`, {
        recordType: record.type,
      })
    }
    record.updatedAt = new Date()
    await this.putRaw(record)
  }

  public async delete(agentContext: AgentContext, record: BaseRecord): Promise<void> {
    await this.deleteById(agentContext, record.constructor as BaseRecordConstructor<BaseRecord>, record.id)
  }

  public async deleteById(
    _agentContext: AgentContext,
    recordClass: BaseRecordConstructor<BaseRecord>,
    id: string,
  ): Promise<void> {
    const existing = await this.findRawById(recordClass.type, id)
    if (!existing) {
      throw new RecordNotFoundError(`Record of type '${recordClass.type}' with id '${id}' not found`, {
        recordType: recordClass.type,
      })
    }
    await this.deleteRaw(recordClass.type, id)
  }

  public async getById(
    _agentContext: AgentContext,
    recordClass: BaseRecordConstructor<BaseRecord>,
    id: string,
  ): Promise<BaseRecord> {
    const raw = await this.findRawById(recordClass.type, id)
    if (!raw) {
      throw new RecordNotFoundError(`Record of type '${recordClass.type}' with id '${id}' not found`, {
        recordType: recordClass.type,
      })
    }
    return JsonTransformer.fromJSON(raw.json, recordClass)
  }

  public async getAll(
    agentContext: AgentContext,
    recordClass: BaseRecordConstructor<BaseRecord>,
  ): Promise<BaseRecord[]> {
    return this.findByQuery(agentContext, recordClass, {})
  }

  public async findByQuery(
    _agentContext: AgentContext,
    recordClass: BaseRecordConstructor<BaseRecord>,
    query: Query<BaseRecord>,
    options?: QueryOptions,
  ): Promise<BaseRecord[]> {
    const rawRecords = await this.getAllRaw(recordClass.type)
    let records = rawRecords
      .filter((raw) => matchesQuery(raw.tags, query))
      .map((raw) => JsonTransformer.fromJSON(raw.json, recordClass))

    if (options?.offset) {
      records = records.slice(options.offset)
    }
    if (options?.limit !== undefined) {
      records = records.slice(0, options.limit)
    }
    return records
  }

  private async putRaw(record: BaseRecord): Promise<void> {
    const db = await this.dbPromise
    await runRequest(db, 'readwrite', (store) => store.put(toStoredRecord(record)))
  }

  private async findRawById(type: string, id: string): Promise<StoredRecord | undefined> {
    const db = await this.dbPromise
    const result = await runRequest<StoredRecord | undefined>(db, 'readonly', (store) => store.get(recordKey(type, id)))
    return result
  }

  private async getAllRaw(type: string): Promise<StoredRecord[]> {
    const db = await this.dbPromise
    const records = await runRequest<StoredRecord[]>(db, 'readonly', (store) => store.getAll())
    return records.filter((record) => record.type === type)
  }

  private async deleteRaw(type: string, id: string): Promise<void> {
    const db = await this.dbPromise
    await runRequest(db, 'readwrite', (store) => store.delete(recordKey(type, id)))
  }
}

function recordKey(type: string, id: string): string {
  return `${type}:${id}`
}

function toStoredRecord(record: BaseRecord): StoredRecord {
  return {
    key: recordKey(record.type, record.id),
    type: record.type,
    id: record.id,
    json: record.toJSON(),
    tags: record.getTags() as Record<string, unknown>,
  }
}

/**
 * The semantics of Credo's InMemoryStorageService (tests/InMemoryStorageService.ts, v0.7.4): the
 * simple keys must all match, and so must every $and part and at least one $or part. That service
 * throws on $not; here it negates its part, as Askar's WQL does.
 */
function matchesQuery(tags: Record<string, unknown>, query: Query<BaseRecord>): boolean {
  const { $and, $or, $not, ...simple } = query as {
    $and?: Query<BaseRecord>[]
    $or?: Query<BaseRecord>[]
    $not?: Query<BaseRecord>
  }
  if (!matchesSimpleQuery(tags, simple)) return false
  if ($and && !$and.every((part) => matchesQuery(tags, part))) return false
  if ($or && !$or.some((part) => matchesQuery(tags, part))) return false
  if ($not && matchesQuery(tags, $not)) return false
  return true
}

function matchesSimpleQuery(tags: Record<string, unknown>, query: Record<string, unknown>): boolean {
  return Object.entries(query).every(([key, expected]) => {
    // Credo queries leave unset filters as undefined; they don't constrain the result.
    if (expected === undefined) return true
    const actual = tags[key]
    if (Array.isArray(expected)) return Array.isArray(actual) && expected.every((value) => actual.includes(value))
    return actual === expected
  })
}

function openDatabase(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1)
    request.onupgradeneeded = (event) => {
      const db = request.result
      if (!db.objectStoreNames.contains('records')) {
        const store = db.createObjectStore('records', { keyPath: 'key' })
        // A new wallet starts at the current storage version, as Credo's own storage services do
        // when they create a store. Without it Credo reads 0.1 and asks to migrate an empty wallet.
        if (event.oldVersion === 0) {
          store.add(
            toStoredRecord(new StorageVersionRecord({ storageVersion: StorageVersionRecord.frameworkStorageVersion })),
          )
        }
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'))
  })
}

function runRequest<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('records', mode)
    const request = operation(transaction.objectStore('records'))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}
