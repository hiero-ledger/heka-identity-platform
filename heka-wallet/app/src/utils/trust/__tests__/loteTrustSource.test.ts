jest.mock('@credo-ts/core', () => ({
  X509Certificate: {
    fromEncodedCertificate: jest.fn(() => ({
      publicJwk: { toJson: () => ({ kty: 'EC', crv: 'P-256', x: 'x', y: 'y' }) },
    })),
  },
}))

import { loadCachedTrustSource, refreshTrustSource, refreshTrustSources, TrustVerifyAgent } from '../loteTrustSource'
import { trustAnchorStore } from '../trustAnchorStore'
import { createTrustSourceCache, inMemoryTrustCacheStorage } from '../trustSourceCache'
import { TrustSourceConfig } from '../trustSources'

const ANCHOR = 'MIID_ANCHOR'
const GRANTED = 'http://uri.etsi.org/TrstSvc/Svcstatus/granted'
const EAA_ISSUANCE = 'http://uri.etsi.org/19602/SvcType/EAA/Issuance'
const WRPAC_ISSUANCE = 'http://uri.etsi.org/19602/SvcType/WRPAC/Issuance'

const b64url = (obj: unknown): string => Buffer.from(JSON.stringify(obj)).toString('base64url')

/** `status: null` omits the status entirely (the EU-profile shape). */
type Anchor = { certificate: string; status?: string | null; serviceType?: string }
type Pointer = { location: string; signers?: string[] }

const lotePayload = (anchors: Anchor[], pointers?: Pointer[]) => ({
  LoTE: {
    ListAndSchemeInformation: {
      SchemeOperatorName: [{ lang: 'en', value: 'Heka' }],
      ...(pointers
        ? {
            PointersToOtherLoTE: pointers.map((pointer) => ({
              LoTELocation: pointer.location,
              ServiceDigitalIdentities: [{ X509Certificates: (pointer.signers ?? []).map((val) => ({ val })) }],
            })),
          }
        : {}),
    },
    TrustedEntitiesList: anchors.map((anchor) => ({
      TrustedEntityServices: [
        {
          ServiceInformation: {
            ...(anchor.status === null ? {} : { ServiceStatus: anchor.status ?? GRANTED }),
            ...(anchor.serviceType ? { ServiceTypeIdentifier: anchor.serviceType } : {}),
            ServiceDigitalIdentity: { X509Certificates: [{ val: anchor.certificate }] },
          },
        },
      ],
    })),
  },
})

function buildJws(overrides: { typ?: string; x5c?: unknown; anchors?: Anchor[]; pointers?: Pointer[] } = {}): string {
  const header = { alg: 'ES256', typ: overrides.typ ?? 'trustlist+jwt', x5c: overrides.x5c ?? ['LEAF', 'ROOT'] }
  const payload = lotePayload(overrides.anchors ?? [{ certificate: ANCHOR }], overrides.pointers)
  return `${b64url(header)}.${b64url(payload)}.${Buffer.from('sig').toString('base64url')}`
}

const jwsResponse = (jws: string): Response => ({ ok: true, text: async () => jws }) as unknown as Response
const notFound = { ok: false, status: 404 } as unknown as Response

/** A fetch stub answering by URL; unknown URLs 404. */
const fetchByUrl = (responses: Record<string, Response | (() => Response)>): typeof fetch =>
  jest.fn(async (input: unknown) => {
    const entry = responses[String(input)]
    return typeof entry === 'function' ? entry() : (entry ?? notFound)
  }) as unknown as typeof fetch

function buildAgent(overrides: Partial<{ validate: jest.Mock; verify: jest.Mock }> = {}): TrustVerifyAgent {
  return {
    x509: { validateCertificateChain: overrides.validate ?? jest.fn().mockResolvedValue([]) },
    kms: { verify: overrides.verify ?? jest.fn().mockResolvedValue({ verified: true }) },
  }
}

const URL = 'https://heka.example/trust-list/eaa-providers'
const issuerSource: TrustSourceConfig = {
  id: 'heka-eaa-providers',
  role: 'credential-issuer',
  url: URL,
  pinnedSigners: ['ROOT'],
}
const accessSource: TrustSourceConfig = {
  id: 'heka-wrpac-providers',
  role: 'access-certificate',
  url: 'https://heka.example/trust-list/wrpac-providers',
  pinnedSigners: ['ROOT'],
}

const refresh = (source: TrustSourceConfig, jws: string, agent = buildAgent()) =>
  refreshTrustSource(agent, source, { fetchImpl: fetchByUrl({ [source.url]: jwsResponse(jws) }) })

describe('refreshTrustSource', () => {
  beforeEach(() => trustAnchorStore.clear())

  test('verifies the JWS against the pinned signers and trusts the listed anchors under the source id', async () => {
    const validate = jest.fn().mockResolvedValue([])
    const verify = jest.fn().mockResolvedValue({ verified: true })

    const result = await refresh(issuerSource, buildJws(), buildAgent({ validate, verify }))

    expect(result).toEqual({ sourceId: issuerSource.id, ok: true, anchorCount: 1 })
    expect(trustAnchorStore.get(issuerSource.id)).toEqual([ANCHOR])
    expect(validate).toHaveBeenCalledWith(
      expect.objectContaining({ certificateChain: ['LEAF', 'ROOT'], trustedCertificates: ['ROOT'] })
    )
    const verifyArgs = verify.mock.calls[0][0]
    expect(verifyArgs.algorithm).toBe('ES256')
    expect(verifyArgs.data).toBeInstanceOf(Uint8Array)
    expect(verifyArgs.signature).toBeInstanceOf(Uint8Array)
  })

  test('each source owns its slice (no clobbering across sources)', async () => {
    trustAnchorStore.set(accessSource.id, ['SERVICE_ROOT'])
    await refresh(issuerSource, buildJws())
    expect(trustAnchorStore.get(issuerSource.id)).toEqual([ANCHOR])
    expect(trustAnchorStore.get(accessSource.id)).toEqual(['SERVICE_ROOT'])
  })

  test('excludes anchors whose service status is not granted', async () => {
    const jws = buildJws({
      anchors: [
        { certificate: ANCHOR },
        { certificate: 'MIID_WITHDRAWN', status: 'http://uri.etsi.org/TrstSvc/Svcstatus/withdrawn' },
      ],
    })
    const result = await refresh(issuerSource, jws)
    expect(result).toMatchObject({ ok: true, anchorCount: 1 })
    expect(trustAnchorStore.get(issuerSource.id)).toEqual([ANCHOR])
  })

  test('EU-profile entries without any ServiceStatus are trusted ("listed is granted")', async () => {
    const result = await refresh(issuerSource, buildJws({ anchors: [{ certificate: ANCHOR, status: null }] }))
    expect(result.ok).toBe(true)
    expect(trustAnchorStore.get(issuerSource.id)).toEqual([ANCHOR])
  })

  test('a credential-issuer source ignores access-certificate services; untyped services are accepted', async () => {
    const jws = buildJws({
      anchors: [
        { certificate: ANCHOR, serviceType: EAA_ISSUANCE },
        { certificate: 'MIID_ACA_ROOT', serviceType: WRPAC_ISSUANCE },
        { certificate: 'MIID_UNTYPED' },
      ],
    })
    await refresh(issuerSource, jws)
    expect(trustAnchorStore.get(issuerSource.id)).toEqual([ANCHOR, 'MIID_UNTYPED'])
  })

  test('an access-certificate source yields only WRPAC (and untyped) services', async () => {
    const jws = buildJws({
      anchors: [
        { certificate: ANCHOR, serviceType: EAA_ISSUANCE },
        { certificate: 'MIID_ACA_ROOT', serviceType: WRPAC_ISSUANCE },
      ],
    })
    await refresh(accessSource, jws)
    expect(trustAnchorStore.get(accessSource.id)).toEqual(['MIID_ACA_ROOT'])
  })

  test('skips a source without pinned signers', async () => {
    const fetchImpl = fetchByUrl({})
    const result = await refreshTrustSource(buildAgent(), { ...issuerSource, pinnedSigners: [] }, { fetchImpl })
    expect(result).toEqual({ sourceId: issuerSource.id, ok: false, reason: 'no-pinned-signers' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  test('surfaces an HTTP error and leaves the slice untouched', async () => {
    trustAnchorStore.set(issuerSource.id, ['PRESERVED'])
    const result = await refreshTrustSource(buildAgent(), issuerSource, { fetchImpl: fetchByUrl({}) })
    expect(result).toEqual({ sourceId: issuerSource.id, ok: false, reason: 'http-404' })
    expect(trustAnchorStore.get(issuerSource.id)).toEqual(['PRESERVED'])
  })

  test.each([
    ['an unexpected JWS typ', buildJws({ typ: 'something-else' }), 'unexpected-typ'],
    ['a malformed (non-3-part) JWS', 'not.a-jws', 'malformed-jws'],
    ['a JWS without x5c', buildJws({ x5c: [] }), 'no-x5c'],
  ])('rejects %s', async (_label, jws, reason) => {
    trustAnchorStore.set(issuerSource.id, ['PRESERVED'])
    const result = await refresh(issuerSource, jws)
    expect(result).toEqual({ sourceId: issuerSource.id, ok: false, reason })
    expect(trustAnchorStore.get(issuerSource.id)).toEqual(['PRESERVED'])
  })

  test('rejects a bad JWS signature and leaves the slice untouched', async () => {
    trustAnchorStore.set(issuerSource.id, ['PRESERVED'])
    const agent = buildAgent({ verify: jest.fn().mockResolvedValue({ verified: false }) })
    const result = await refresh(issuerSource, buildJws(), agent)
    expect(result).toEqual({ sourceId: issuerSource.id, ok: false, reason: 'invalid-signature' })
    expect(trustAnchorStore.get(issuerSource.id)).toEqual(['PRESERVED'])
  })

  test('surfaces a chain-validation failure and leaves the slice untouched', async () => {
    trustAnchorStore.set(issuerSource.id, ['PRESERVED'])
    const agent = buildAgent({ validate: jest.fn().mockRejectedValue(new Error('untrusted chain')) })
    const result = await refresh(issuerSource, buildJws(), agent)
    expect(result).toEqual({ sourceId: issuerSource.id, ok: false, reason: 'untrusted chain' })
    expect(trustAnchorStore.get(issuerSource.id)).toEqual(['PRESERVED'])
  })

  describe('pointer following', () => {
    const POINTED = 'https://ec.example/pointed-list'
    const withPointer = buildJws({ pointers: [{ location: POINTED, signers: ['POINTED_SIGNER'] }] })
    const pointedList = buildJws({
      anchors: [{ certificate: 'MIID_POINTED' }],
      x5c: ['POINTED_LEAF', 'POINTED_SIGNER'],
      // a second-level pointer that must NOT be followed
      pointers: [{ location: 'https://ec.example/deeper', signers: ['DEEPER'] }],
    })

    test('is off by default: pointers are neither fetched nor reported', async () => {
      const fetchImpl = fetchByUrl({ [URL]: jwsResponse(withPointer), [POINTED]: jwsResponse(pointedList) })
      const result = await refreshTrustSource(buildAgent(), issuerSource, { fetchImpl })
      expect(result).toEqual({ sourceId: issuerSource.id, ok: true, anchorCount: 1 })
      expect(fetchImpl).toHaveBeenCalledTimes(1)
    })

    test("follows one level, pinned to the pointer's own signer certificates, and unions the anchors", async () => {
      const validate = jest.fn().mockResolvedValue([])
      const fetchImpl = fetchByUrl({ [URL]: jwsResponse(withPointer), [POINTED]: jwsResponse(pointedList) })
      const result = await refreshTrustSource(
        buildAgent({ validate }),
        { ...issuerSource, followPointers: true },
        { fetchImpl }
      )

      expect(result).toEqual({
        sourceId: issuerSource.id,
        ok: true,
        anchorCount: 2,
        pointers: [{ location: POINTED, ok: true, anchorCount: 1 }],
      })
      expect(trustAnchorStore.get(issuerSource.id)).toEqual([ANCHOR, 'MIID_POINTED'])
      expect(validate).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          certificateChain: ['POINTED_LEAF', 'POINTED_SIGNER'],
          trustedCertificates: ['POINTED_SIGNER'],
        })
      )
      // depth 1: the pointed list's own pointer is never fetched
      expect(fetchImpl).toHaveBeenCalledTimes(2)
    })

    test('a pointer without signer certificates is skipped and a failing pointer never fails the source', async () => {
      const unpinned = buildJws({
        pointers: [{ location: POINTED }, { location: 'https://ec.example/broken', signers: ['X'] }],
      })
      const fetchImpl = fetchByUrl({ [URL]: jwsResponse(unpinned) })
      const result = await refreshTrustSource(buildAgent(), { ...issuerSource, followPointers: true }, { fetchImpl })
      expect(result).toEqual({
        sourceId: issuerSource.id,
        ok: true,
        anchorCount: 1,
        pointers: [
          { location: POINTED, ok: false, reason: 'no-pinned-signers' },
          { location: 'https://ec.example/broken', ok: false, reason: 'http-404' },
        ],
      })
      expect(trustAnchorStore.get(issuerSource.id)).toEqual([ANCHOR])
    })
  })
})

describe('refreshTrustSources', () => {
  beforeEach(() => trustAnchorStore.clear())

  test('refreshes every source and isolates failures per source', async () => {
    const fetchImpl = fetchByUrl({
      [issuerSource.url]: jwsResponse(buildJws()),
      [accessSource.url]: () => {
        throw new Error('network down')
      },
    })
    const results = await refreshTrustSources(buildAgent(), [issuerSource, accessSource], { fetchImpl })
    expect(results).toEqual([
      { sourceId: issuerSource.id, ok: true, anchorCount: 1 },
      { sourceId: accessSource.id, ok: false, reason: 'network down' },
    ])
    expect(trustAnchorStore.get(issuerSource.id)).toEqual([ANCHOR])
    expect(trustAnchorStore.has(accessSource.id)).toBe(false)
  })
})

describe('on-device cache', () => {
  const POINTER_URL = 'https://other.example/lote'
  const NOW = 1_700_000_000_000
  const pointerSource: TrustSourceConfig = { ...issuerSource, followPointers: true }

  beforeEach(() => trustAnchorStore.clear())

  test('a refresh stores the verified list and only the pointer lists that verified', async () => {
    const cache = createTrustSourceCache(inMemoryTrustCacheStorage())
    const primary = buildJws({
      pointers: [
        { location: POINTER_URL, signers: ['OTHER_ROOT'] },
        { location: 'https://broken.example/lote', signers: ['X'] },
      ],
    })
    const pointed = buildJws({ anchors: [{ certificate: 'MIID_POINTED' }] })
    const fetchImpl = fetchByUrl({ [URL]: jwsResponse(primary), [POINTER_URL]: jwsResponse(pointed) })

    const result = await refreshTrustSource(buildAgent(), pointerSource, { fetchImpl, cache, now: () => NOW })

    expect(result).toMatchObject({ ok: true, anchorCount: 2, cached: true })
    expect(await cache.read(issuerSource.id)).toEqual({
      jws: primary,
      pointers: [{ location: POINTER_URL, jws: pointed }],
      fetchedAt: NOW,
    })
  })

  test('a failed refresh leaves the cache entry untouched', async () => {
    const cache = createTrustSourceCache(inMemoryTrustCacheStorage())
    await cache.write(issuerSource.id, { jws: buildJws(), fetchedAt: NOW })

    await refreshTrustSource(buildAgent(), issuerSource, { fetchImpl: fetchByUrl({}), cache })

    expect((await cache.read(issuerSource.id))?.fetchedAt).toBe(NOW)
  })

  test('loads a cached list through the same verification and fills the slice without any network', async () => {
    const cache = createTrustSourceCache(inMemoryTrustCacheStorage())
    await cache.write(issuerSource.id, { jws: buildJws(), fetchedAt: NOW - 1000 })
    const validate = jest.fn().mockResolvedValue([])

    const result = await loadCachedTrustSource(buildAgent({ validate }), issuerSource, cache, () => NOW)

    expect(result).toEqual({ sourceId: issuerSource.id, ok: true, anchorCount: 1, fetchedAt: NOW - 1000, stale: false })
    expect(trustAnchorStore.get(issuerSource.id)).toEqual([ANCHOR])
    expect(validate).toHaveBeenCalledWith({ certificateChain: ['LEAF', 'ROOT'], trustedCertificates: ['ROOT'] })
  })

  test('reports no-cache when nothing is stored and skips a source without pins', async () => {
    const cache = createTrustSourceCache(inMemoryTrustCacheStorage())

    expect(await loadCachedTrustSource(buildAgent(), issuerSource, cache)).toEqual({
      sourceId: issuerSource.id,
      ok: false,
      reason: 'no-cache',
    })
    expect(await loadCachedTrustSource(buildAgent(), { ...issuerSource, pinnedSigners: [] }, cache)).toEqual({
      sourceId: issuerSource.id,
      ok: false,
      reason: 'no-pinned-signers',
    })
  })

  test('a cached document that no longer verifies (wrong typ / changed pins) is rejected and evicted', async () => {
    const cache = createTrustSourceCache(inMemoryTrustCacheStorage())
    await cache.write(issuerSource.id, { jws: buildJws({ typ: 'jwt' }), fetchedAt: NOW })

    expect(await loadCachedTrustSource(buildAgent(), issuerSource, cache)).toEqual({
      sourceId: issuerSource.id,
      ok: false,
      reason: 'unexpected-typ',
    })
    expect(await cache.read(issuerSource.id)).toBeUndefined()

    await cache.write(issuerSource.id, { jws: buildJws(), fetchedAt: NOW })
    const validate = jest.fn().mockRejectedValue(new Error('No trusted certificate found'))

    expect(await loadCachedTrustSource(buildAgent({ validate }), issuerSource, cache)).toMatchObject({ ok: false })
    expect(await cache.read(issuerSource.id)).toBeUndefined()
    expect(trustAnchorStore.get(issuerSource.id)).toEqual([])
  })

  test('cached pointer lists are verified against the pins the verified parent list declares', async () => {
    const cache = createTrustSourceCache(inMemoryTrustCacheStorage())
    const primary = buildJws({ pointers: [{ location: POINTER_URL, signers: ['OTHER_ROOT'] }] })
    const pointed = buildJws({ anchors: [{ certificate: 'MIID_POINTED' }] })
    await cache.write(issuerSource.id, {
      jws: primary,
      pointers: [
        { location: POINTER_URL, jws: pointed },
        { location: 'https://stale.example/lote', jws: buildJws({ anchors: [{ certificate: 'MIID_STALE' }] }) },
      ],
      fetchedAt: NOW,
    })
    const validate = jest.fn().mockResolvedValue([])

    const result = await loadCachedTrustSource(buildAgent({ validate }), pointerSource, cache, () => NOW)

    expect(result).toMatchObject({ ok: true, anchorCount: 2 })
    expect(trustAnchorStore.get(issuerSource.id)).toEqual([ANCHOR, 'MIID_POINTED'])
    expect(validate).toHaveBeenLastCalledWith({
      certificateChain: ['LEAF', 'ROOT'],
      trustedCertificates: ['OTHER_ROOT'],
    })
    expect(validate).toHaveBeenCalledTimes(2)
  })
})
