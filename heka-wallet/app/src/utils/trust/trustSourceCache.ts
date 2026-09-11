/**
 * On-device cache of the **signed** trust-list documents (one entry per configured source). Only the
 * raw LoTE JWTs are stored — never the anchors extracted from them — and a cached document is trusted
 * only after it passes the same verification as a freshly fetched one (`verifySignedLote`, pinned to
 * the source's signer certificates from configuration). Storage integrity is therefore not a trust
 * assumption, which is why plain `AsyncStorage` is sufficient.
 */
export interface CachedTrustSource {
  /** The source's own list (compact JWS). */
  jws: string
  /** Followed pointer lists (compact JWS each), keyed by the location they were fetched from. */
  pointers?: Array<{ location: string; jws: string }>
  /** Epoch ms of the fetch that produced this entry. */
  fetchedAt: number
  /** The list's `LoTESequenceNumber` at that fetch — the replay baseline a later refresh must not regress below. */
  sequenceNumber?: number
}

/** The key-value storage the cache needs: `AsyncStorage` in the app, a Map in tests. */
export interface TrustCacheStorage {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
  removeItem(key: string): Promise<void>
}

export interface TrustSourceCache {
  /** The cached entry, or `undefined` when absent or unreadable (an unreadable entry is evicted). */
  read(sourceId: string): Promise<CachedTrustSource | undefined>
  write(sourceId: string, entry: CachedTrustSource): Promise<void>
  evict(sourceId: string): Promise<void>
}

const KEY_PREFIX = 'trust-source-cache:'
const CACHE_VERSION = 1

interface StoredEntry extends CachedTrustSource {
  v: number
}

function parseEntry(raw: string): CachedTrustSource {
  const parsed = JSON.parse(raw) as Partial<StoredEntry>
  if (parsed.v !== CACHE_VERSION || typeof parsed.jws !== 'string' || typeof parsed.fetchedAt !== 'number') {
    throw new Error('malformed trust cache entry')
  }
  const pointers = Array.isArray(parsed.pointers)
    ? parsed.pointers.filter(
        (pointer): pointer is { location: string; jws: string } =>
          typeof pointer?.location === 'string' && typeof pointer?.jws === 'string'
      )
    : undefined
  return {
    jws: parsed.jws,
    fetchedAt: parsed.fetchedAt,
    ...(pointers ? { pointers } : {}),
    ...(typeof parsed.sequenceNumber === 'number' ? { sequenceNumber: parsed.sequenceNumber } : {}),
  }
}

export function createTrustSourceCache(storage: TrustCacheStorage): TrustSourceCache {
  const keyOf = (sourceId: string): string => `${KEY_PREFIX}${sourceId}`
  return {
    async read(sourceId) {
      const raw = await storage.getItem(keyOf(sourceId))
      if (raw === null) return undefined
      try {
        return parseEntry(raw)
      } catch {
        await storage.removeItem(keyOf(sourceId)).catch(() => undefined)
        return undefined
      }
    },
    write(sourceId, entry) {
      const stored: StoredEntry = { v: CACHE_VERSION, ...entry }
      return storage.setItem(keyOf(sourceId), JSON.stringify(stored))
    },
    evict(sourceId) {
      return storage.removeItem(keyOf(sourceId))
    },
  }
}

/** A Map-backed storage for tests. */
export function inMemoryTrustCacheStorage(): TrustCacheStorage {
  const entries = new Map<string, string>()
  return {
    getItem: (key) => Promise.resolve(entries.get(key) ?? null),
    setItem: (key, value) => {
      entries.set(key, value)
      return Promise.resolve()
    },
    removeItem: (key) => {
      entries.delete(key)
      return Promise.resolve()
    },
  }
}
