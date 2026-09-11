import { createTrustSourceCache, inMemoryTrustCacheStorage } from '../trustSourceCache'

describe('trustSourceCache', () => {
  test('round-trips an entry per source id', async () => {
    const cache = createTrustSourceCache(inMemoryTrustCacheStorage())
    const entry = { jws: 'a.b.c', pointers: [{ location: 'https://x/lote', jws: 'd.e.f' }], fetchedAt: 1000 }

    await cache.write('src', entry)

    expect(await cache.read('src')).toEqual(entry)
    expect(await cache.read('other')).toBeUndefined()
  })

  test('evicts an entry', async () => {
    const cache = createTrustSourceCache(inMemoryTrustCacheStorage())
    await cache.write('src', { jws: 'a.b.c', fetchedAt: 1 })

    await cache.evict('src')

    expect(await cache.read('src')).toBeUndefined()
  })

  test('an unreadable entry reads as absent and is removed from storage', async () => {
    const storage = inMemoryTrustCacheStorage()
    const cache = createTrustSourceCache(storage)
    await storage.setItem('trust-source-cache:broken', '{not json')
    await storage.setItem('trust-source-cache:old', JSON.stringify({ v: 0, jws: 'a.b.c', fetchedAt: 1 }))
    await storage.setItem('trust-source-cache:typed', JSON.stringify({ v: 1, jws: 42, fetchedAt: 1 }))

    expect(await cache.read('broken')).toBeUndefined()
    expect(await cache.read('old')).toBeUndefined()
    expect(await cache.read('typed')).toBeUndefined()
    expect(await storage.getItem('trust-source-cache:broken')).toBeNull()
    expect(await storage.getItem('trust-source-cache:old')).toBeNull()
  })

  test('drops malformed pointer entries but keeps the list', async () => {
    const storage = inMemoryTrustCacheStorage()
    const cache = createTrustSourceCache(storage)
    await storage.setItem(
      'trust-source-cache:src',
      JSON.stringify({
        v: 1,
        jws: 'a.b.c',
        fetchedAt: 1,
        pointers: [{ location: 'https://x', jws: 'd.e.f' }, { nope: 1 }],
      })
    )

    expect(await cache.read('src')).toEqual({
      jws: 'a.b.c',
      fetchedAt: 1,
      pointers: [{ location: 'https://x', jws: 'd.e.f' }],
    })
  })
})
