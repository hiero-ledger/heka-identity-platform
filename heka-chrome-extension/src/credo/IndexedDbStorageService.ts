import {
  JsonTransformer,
  RecordDuplicateError,
  RecordNotFoundError,
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
    const existing = await this.findRawById(record.type, record.id)
    if (existing) {
      throw new RecordDuplicateError(`Record of type '${record.type}' with id '${record.id}' already exists`, {
        recordType: record.type,
      })
    }
    await this.putRaw(record)
  }

  public async update(_agentContext: AgentContext, record: BaseRecord): Promise<void> {
    const existing = await this.findRawById(record.type, record.id)
    if (!existing) {
      throw new RecordNotFoundError(`Record of type '${record.type}' with id '${record.id}' not found`, {
        recordType: record.type,
      })
    }
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

  public async getAll(agentContext: AgentContext, recordClass: BaseRecordConstructor<BaseRecord>): Promise<BaseRecord[]> {
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
      .map((raw) => JsonTransformer.fromJSON(raw.json, recordClass))
      .filter((record) => matchesQuery(record, query))

    if (options?.offset) {
      records = records.slice(options.offset)
    }
    if (options?.limit !== undefined) {
      records = records.slice(0, options.limit)
    }
    return records
  }

  private async putRaw(record: BaseRecord): Promise<void> {
    const stored: StoredRecord = {
      key: recordKey(record.type, record.id),
      type: record.type,
      id: record.id,
      json: record.toJSON(),
      tags: record.getTags() as Record<string, unknown>,
    }
    const db = await this.dbPromise
    await runRequest(db, 'readwrite', (store) => store.put(stored))
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

function matchesQuery(record: BaseRecord, query: Query<BaseRecord>): boolean {
  const advanced = query as {
    $and?: Query<BaseRecord>[]
    $or?: Query<BaseRecord>[]
    $not?: Query<BaseRecord>
  }
  if (advanced.$and) return advanced.$and.every((part) => matchesQuery(record, part))
  if (advanced.$or) return advanced.$or.some((part) => matchesQuery(record, part))
  if (advanced.$not) return !matchesQuery(record, advanced.$not)

  const tags = record.getTags() as Record<string, unknown>
  return Object.entries(query as Record<string, unknown>).every(([key, expected]) => {
    if (key.startsWith('$')) return true
    const actual = tags[key]
    if (Array.isArray(actual)) return actual.includes(expected)
    return actual === expected
  })
}

function openDatabase(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('records')) {
        db.createObjectStore('records', { keyPath: 'key' })
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
