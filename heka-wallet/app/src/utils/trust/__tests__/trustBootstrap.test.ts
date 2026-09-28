jest.mock('@credo-ts/core', () => ({
  X509Certificate: {
    fromEncodedCertificate: jest.fn(() => ({
      publicJwk: { toJson: () => ({ kty: 'EC', crv: 'P-256', x: 'x', y: 'y' }) },
    })),
  },
}))

import { TrustVerifyAgent } from '../loteTrustSource'
import { bootstrapTrustAnchors, summarizeTrustBootstrap } from '../trustBootstrap'
import { trustAnchorStore } from '../trustAnchorStore'
import { createTrustSourceCache, inMemoryTrustCacheStorage } from '../trustSourceCache'
import { TrustSourceConfig } from '../trustSources'

const b64url = (obj: unknown): string => Buffer.from(JSON.stringify(obj)).toString('base64url')

const buildJws = (anchors: string[], nextUpdate?: string): string => {
  const header = { alg: 'ES256', typ: 'trustlist+jwt', x5c: ['LEAF', 'ROOT'] }
  const payload = {
    LoTE: {
      ListAndSchemeInformation: { ...(nextUpdate ? { NextUpdate: nextUpdate } : {}) },
      TrustedEntitiesList: anchors.map((certificate) => ({
        TrustedEntityServices: [
          { ServiceInformation: { ServiceDigitalIdentity: { X509Certificates: [{ val: certificate }] } } },
        ],
      })),
    },
  }
  return `${b64url(header)}.${b64url(payload)}.${Buffer.from('sig').toString('base64url')}`
}

const agent: TrustVerifyAgent = {
  x509: { validateCertificateChain: jest.fn().mockResolvedValue([]) },
  kms: { verify: jest.fn().mockResolvedValue({ verified: true }) },
}

const URL = 'https://heka.example/trust-list/eaa-providers'
const source: TrustSourceConfig = { id: 'eaa', role: 'credential-issuer', url: URL, pinnedSigners: ['ROOT'] }

const respond = (jws: string): typeof fetch =>
  jest.fn(async () => ({ ok: true, text: async () => jws })) as unknown as typeof fetch
const never: typeof fetch = jest.fn(() => new Promise<Response>(() => undefined)) as unknown as typeof fetch

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.parse('2026-09-10T12:00:00Z')

describe('bootstrapTrustAnchors', () => {
  beforeEach(() => trustAnchorStore.clear())

  test('no cache: awaits one network refresh, which fills the store and the cache', async () => {
    const cache = createTrustSourceCache(inMemoryTrustCacheStorage())
    const fetchImpl = respond(buildJws(['A1']))

    const result = await bootstrapTrustAnchors(agent, [source], { cache, fetchImpl, now: () => NOW })

    expect(result.refresh).toBe('awaited')
    expect(result.refreshed).toEqual([{ sourceId: 'eaa', ok: true, anchorCount: 1, cached: true }])
    expect(trustAnchorStore.get('eaa')).toEqual(['A1'])
    expect((await cache.read('eaa'))?.fetchedAt).toBe(NOW)
  })

  test('no cache and a hanging network: resolves at the bound, store untouched', async () => {
    const cache = createTrustSourceCache(inMemoryTrustCacheStorage())

    const started = Date.now()
    const result = await bootstrapTrustAnchors(agent, [source], { cache, fetchImpl: never, refreshTimeoutMs: 30 })

    expect(result.refresh).toBe('awaited')
    expect(result.refreshed).toBe('timed-out')
    expect(Date.now() - started).toBeLessThan(1000)
    expect(trustAnchorStore.get('eaa')).toEqual([])
  })

  test('fresh cache: loads it without touching the network', async () => {
    const cache = createTrustSourceCache(inMemoryTrustCacheStorage())
    await cache.write('eaa', { jws: buildJws(['A1'], '2026-09-17T12:00:00Z'), fetchedAt: NOW - DAY / 2 })
    const fetchImpl = respond(buildJws(['A2']))

    const result = await bootstrapTrustAnchors(agent, [source], { cache, fetchImpl, now: () => NOW })

    expect(result.refresh).toBe('none')
    expect(result.loaded).toEqual([
      { sourceId: 'eaa', ok: true, anchorCount: 1, fetchedAt: NOW - DAY / 2, stale: false },
    ])
    expect(trustAnchorStore.get('eaa')).toEqual(['A1'])
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  test('stale cache (past NextUpdate): serves the cache now and refreshes in the background', async () => {
    const cache = createTrustSourceCache(inMemoryTrustCacheStorage())
    await cache.write('eaa', { jws: buildJws(['A1'], '2026-09-10T11:00:00Z'), fetchedAt: NOW - DAY / 2 })
    const fetchImpl = respond(buildJws(['A2']))

    const result = await bootstrapTrustAnchors(agent, [source], { cache, fetchImpl, now: () => NOW })

    expect(result.refresh).toBe('background')
    expect(result.loaded[0]).toMatchObject({ ok: true, stale: true })
    expect(trustAnchorStore.get('eaa')).toEqual(['A1'])
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(trustAnchorStore.get('eaa')).toEqual(['A2'])
  })

  test('stale cache by age (no NextUpdate, older than a day) also refreshes in the background', async () => {
    const cache = createTrustSourceCache(inMemoryTrustCacheStorage())
    await cache.write('eaa', { jws: buildJws(['A1']), fetchedAt: NOW - 2 * DAY })

    const result = await bootstrapTrustAnchors(agent, [source], {
      cache,
      fetchImpl: respond(buildJws(['A1'])),
      now: () => NOW,
    })

    expect(result.refresh).toBe('background')
    expect(result.loaded[0]).toMatchObject({ ok: true, stale: true })
  })

  test('a tampered cache entry is rejected and evicted, then the network refresh is awaited', async () => {
    const cache = createTrustSourceCache(inMemoryTrustCacheStorage())
    await cache.write('eaa', { jws: buildJws(['EVIL']), fetchedAt: NOW })
    const rejecting: TrustVerifyAgent = {
      x509: agent.x509,
      kms: { verify: jest.fn().mockResolvedValueOnce({ verified: false }).mockResolvedValue({ verified: true }) },
    }

    const result = await bootstrapTrustAnchors(rejecting, [source], {
      cache,
      fetchImpl: respond(buildJws(['A1'])),
      now: () => NOW,
    })

    expect(result.loaded).toEqual([{ sourceId: 'eaa', ok: false, reason: 'invalid-signature' }])
    expect(result.refresh).toBe('awaited')
    expect(trustAnchorStore.get('eaa')).toEqual(['A1'])
    expect((await cache.read('eaa'))?.jws).toBe(buildJws(['A1']))
  })

  test('sources that cannot be refreshed (no pins) never trigger a network wait', async () => {
    const cache = createTrustSourceCache(inMemoryTrustCacheStorage())
    const fetchImpl = respond(buildJws(['A1']))

    const result = await bootstrapTrustAnchors(agent, [{ ...source, pinnedSigners: [] }], { cache, fetchImpl })

    expect(result).toEqual({ loaded: [{ sourceId: 'eaa', ok: false, reason: 'no-pinned-signers' }], refresh: 'none' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('summarizeTrustBootstrap', () => {
  test('renders one line', () => {
    expect(
      summarizeTrustBootstrap({
        loaded: [
          { sourceId: 'eaa', ok: true, anchorCount: 2, stale: true },
          { sourceId: 'wrpac', ok: false, reason: 'no-cache' },
        ],
        refresh: 'awaited',
        refreshed: [
          { sourceId: 'eaa', ok: true },
          { sourceId: 'wrpac', ok: false, reason: 'http-404' },
        ],
      })
    ).toBe('cache: eaa=2 anchor(s) (stale), wrpac=no-cache; refresh: awaited (1/2 ok)')
  })
})
