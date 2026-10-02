import { webcrypto } from 'node:crypto'

import { createMock } from '@golevelup/ts-vitest'
import * as x509 from '@peculiar/x509'
import { DOMImplementation, DOMParser, XMLSerializer } from '@xmldom/xmldom'
import * as xadesjs from 'xadesjs'
import { setNodeDependencies } from 'xml-core'

import { Agent } from 'common/agent'
import { Logger } from 'common/logger'

import { EU_TL_SERVICE_TYPE } from '../eu-service-types'
import { EuTrustAnchorIngestionService } from '../eu-trust-anchor-ingestion.service'
import { EU_GENERIC_TSL_TYPE } from '../eu-trusted-list-parser'

const crypto = webcrypto as unknown as Crypto
xadesjs.Application.setEngine('NodeJS', crypto)
setNodeDependencies({ DOMParser, XMLSerializer, DOMImplementation })
x509.cryptoProvider.set(crypto)

const alg = { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' } as const
const QC = 'http://uri.etsi.org/TrstSvc/Svctype/CA/QC'
const GRANTED = 'http://uri.etsi.org/TrstSvc/Svcstatus/granted'

const LOTL_URL = 'https://ec.europa.eu/tools/lotl/eu-lotl.xml'
const DE_URL = 'https://de.example/tl.xml'
const FR_URL = 'https://fr.example/tl.xml'

type Cert = { keys: CryptoKeyPair; base64: string }

async function makeCert(cn: string): Promise<Cert> {
  const keys = await crypto.subtle.generateKey(alg, true, ['sign', 'verify'])
  const cert = await x509.X509CertificateGenerator.createSelfSigned(
    { keys, name: `CN=${cn}`, notBefore: new Date('2026-01-01Z'), notAfter: new Date('2031-01-01Z') },
    crypto,
  )
  return { keys, base64: Buffer.from(cert.rawData).toString('base64') }
}

/** Append an enveloped XAdES signature (by `signer`) to an XML document and serialize. */
async function signXml(xml: string, signer: Cert): Promise<string> {
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  const signed = new xadesjs.SignedXml()
  const signature = await signed.Sign(alg, signer.keys.privateKey, doc as unknown as Document, {
    x509: [signer.base64],
    references: [{ uri: '', hash: 'SHA-256', transforms: ['enveloped', 'c14n'] }],
  })
  const rootElement = doc.documentElement as unknown as Element
  rootElement.appendChild(signature.GetXml() as unknown as Node)
  return new XMLSerializer().serializeToString(doc)
}

/** Optional `SchemeInformation` freshness fields of a TL / LoTL fixture. */
type SchemeFields = { sequence?: number; nextUpdate?: string }
const schemeXml = (scheme: SchemeFields) =>
  `${scheme.sequence !== undefined ? `<TSLSequenceNumber>${scheme.sequence}</TSLSequenceNumber>` : ''}${
    scheme.nextUpdate ? `<NextUpdate><dateTime>${scheme.nextUpdate}</dateTime></NextUpdate>` : ''
  }`
const inOneYear = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString()
const anHourAgo = new Date(Date.now() - 3600 * 1000).toISOString()

/** An (unsigned) national Trusted List carrying the given granted services. */
const nationalTlWith = (
  services: { type: string; certificateBase64: string }[],
  scheme: SchemeFields = {},
) => `<?xml version="1.0" encoding="UTF-8"?>
<TrustServiceStatusList xmlns="http://uri.etsi.org/02231/v2#">
  <SchemeInformation>${schemeXml(scheme)}</SchemeInformation>
  <TrustServiceProviderList><TrustServiceProvider><TSPServices>${services
    .map(
      (service) => `<TSPService><ServiceInformation>
    <ServiceTypeIdentifier>${service.type}</ServiceTypeIdentifier>
    <ServiceStatus>${GRANTED}</ServiceStatus>
    <ServiceDigitalIdentity><DigitalId><X509Certificate>${service.certificateBase64}</X509Certificate></DigitalId></ServiceDigitalIdentity>
  </ServiceInformation></TSPService>`,
    )
    .join('')}</TSPServices></TrustServiceProvider></TrustServiceProviderList>
</TrustServiceStatusList>`

/** An (unsigned) national Trusted List carrying one granted qualified-CA issuer anchor. */
const nationalTl = (anchorBase64: string, scheme: SchemeFields = {}) =>
  nationalTlWith([{ type: QC, certificateBase64: anchorBase64 }], scheme)

const lotlPointer = (location: string, signerBase64: string, territory: string) => `
  <OtherTSLPointer>
    <ServiceDigitalIdentities><ServiceDigitalIdentity><DigitalId>
      <X509Certificate>${signerBase64}</X509Certificate>
    </DigitalId></ServiceDigitalIdentity></ServiceDigitalIdentities>
    <TSLLocation>${location}</TSLLocation>
    <AdditionalInformation>
      <OtherInformation><TSLType>${EU_GENERIC_TSL_TYPE}</TSLType></OtherInformation>
      <OtherInformation><SchemeTerritory>${territory}</SchemeTerritory></OtherInformation>
    </AdditionalInformation>
  </OtherTSLPointer>`

/** An (unsigned) LoTL pointing to the given national TLs. */
const lotlWith = (scheme: SchemeFields, ...pointers: string[]) => `<?xml version="1.0" encoding="UTF-8"?>
<TrustServiceStatusList xmlns="http://uri.etsi.org/02231/v2#">
  <SchemeInformation>${schemeXml(scheme)}<PointersToOtherTSL>${pointers.join('')}</PointersToOtherTSL></SchemeInformation>
</TrustServiceStatusList>`
const lotl = (...pointers: string[]) => lotlWith({}, ...pointers)

const textResponse = (body: string, headers: Record<string, string> = {}): Response =>
  ({ ok: true, status: 200, headers: new Headers(headers), text: () => Promise.resolve(body) }) as unknown as Response
const notFound = (): Response =>
  ({ ok: false, status: 404, headers: new Headers(), text: () => Promise.resolve('') }) as unknown as Response

type Route = string | Response | (() => Response | Promise<Response>)
/** Stub `fetch` by URL: a string body, a Response-like object, or a function producing one; unknown → 404. */
function stubFetch(routes: Record<string, Route>): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((url: string): Promise<Response> => {
    const route = routes[url]
    if (route == null) return Promise.resolve(notFound())
    if (typeof route === 'string') return Promise.resolve(textResponse(route))
    return Promise.resolve(typeof route === 'function' ? route() : route)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function buildService(config: { lotlUrl?: string; lotlSigner?: string; territories?: string; serviceTypes?: string }): {
  service: EuTrustAnchorIngestionService
  logger: Logger
} {
  const logger: Logger = createMock<Logger>()
  const agent = createMock<Agent>({
    agencyConfig: {
      euLotlUrl: config.lotlUrl ?? LOTL_URL,
      euLotlSignerCertificates: config.lotlSigner ?? '',
      euLotlSchemeTerritories: config.territories ?? '',
      euTrustedListServiceTypes: config.serviceTypes ?? '',
    },
  })
  return { service: new EuTrustAnchorIngestionService(agent, logger), logger }
}

const ingestedAnchors = async (service: EuTrustAnchorIngestionService): Promise<string[]> =>
  (await service.anchorsFromLotl()).map((certificate) => certificate.toString('base64'))

describe('EuTrustAnchorIngestionService — LoTL traversal (ETSI TS 119 612)', () => {
  let commission: Cert
  let deSigner: Cert
  let frSigner: Cert
  let rogue: Cert
  let deAnchor: string
  let frAnchor: string

  beforeAll(async () => {
    commission = await makeCert('EU Commission LoTL Signer')
    deSigner = await makeCert('DE Scheme Operator')
    frSigner = await makeCert('FR Scheme Operator')
    rogue = await makeCert('Rogue Signer')
    deAnchor = (await makeCert('DE PID Issuer CA')).base64
    frAnchor = (await makeCert('FR PID Issuer CA')).base64
  })

  afterEach(() => vi.unstubAllGlobals())

  test('verifies the LoTL + each national TL and unions their granted anchors', async () => {
    const signedLotl = await signXml(
      lotl(lotlPointer(DE_URL, deSigner.base64, 'DE'), lotlPointer(FR_URL, frSigner.base64, 'FR')),
      commission,
    )
    stubFetch({
      [LOTL_URL]: signedLotl,
      [DE_URL]: await signXml(nationalTl(deAnchor), deSigner),
      [FR_URL]: await signXml(nationalTl(frAnchor), frSigner),
    })
    const { service } = buildService({ lotlSigner: commission.base64 })

    const anchors = await ingestedAnchors(service)
    expect(anchors).toHaveLength(2)
    expect(new Set(anchors)).toEqual(new Set([deAnchor, frAnchor]))
  })

  test('best-effort union: a national TL whose signer does not match the LoTL-declared pin is skipped (and logged), the rest served', async () => {
    const signedLotl = await signXml(
      lotl(lotlPointer(DE_URL, deSigner.base64, 'DE'), lotlPointer(FR_URL, frSigner.base64, 'FR')),
      commission,
    )
    stubFetch({
      [LOTL_URL]: signedLotl,
      [DE_URL]: await signXml(nationalTl(deAnchor), deSigner),
      // FR TL is signed by a rogue key — its signature is well-formed but does not match the pin the LoTL declared for FR.
      [FR_URL]: await signXml(nationalTl(frAnchor), rogue),
    })
    const { service, logger } = buildService({ lotlSigner: commission.base64 })

    const anchors = await ingestedAnchors(service)
    expect(anchors).toEqual([deAnchor]) // FR's anchor is excluded, never injected
    expect(logger.warn).toHaveBeenCalledTimes(1)
    const [payload, message] = (logger.warn as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]
    expect(message).toMatch(/skipped 1\/2/)
    expect((payload as { dropped: { territory: string }[] }).dropped[0].territory).toBe('FR')
  })

  test('best-effort union: an unreachable national TL endpoint is skipped, the rest served', async () => {
    const signedLotl = await signXml(
      lotl(lotlPointer(DE_URL, deSigner.base64, 'DE'), lotlPointer(FR_URL, frSigner.base64, 'FR')),
      commission,
    )
    stubFetch({
      [LOTL_URL]: signedLotl,
      [DE_URL]: await signXml(nationalTl(deAnchor), deSigner),
      // FR_URL intentionally unrouted → HTTP 404.
    })
    const { service } = buildService({ lotlSigner: commission.base64 })
    expect(await ingestedAnchors(service)).toEqual([deAnchor])
  })

  test('fail-closed at the root: a LoTL not signed by the pinned Commission signer aborts the whole traversal', async () => {
    const signedLotl = await signXml(lotl(lotlPointer(DE_URL, deSigner.base64, 'DE')), commission)
    stubFetch({ [LOTL_URL]: signedLotl, [DE_URL]: await signXml(nationalTl(deAnchor), deSigner) })
    // Pin a DIFFERENT signer than the one that actually signed the LoTL.
    const { service } = buildService({ lotlSigner: rogue.base64 })
    await expect(service.anchorsFromLotl()).rejects.toThrow(/not a configured scheme-operator anchor/)
  })

  test('only credential-issuer service types become anchors — TSAs, QWAC CAs and national roots in a TL are ignored', async () => {
    const qeaaAnchor = (await makeCert('DE QEAA Provider')).base64
    const tsaAnchor = (await makeCert('DE Qualified TSA')).base64
    const qwacCaAnchor = (await makeCert('DE QWAC CA')).base64
    const nationalRoot = (await makeCert('DE National Root CA')).base64
    const signedLotl = await signXml(lotl(lotlPointer(DE_URL, deSigner.base64, 'DE')), commission)
    stubFetch({
      [LOTL_URL]: signedLotl,
      [DE_URL]: await signXml(
        nationalTlWith([
          { type: EU_TL_SERVICE_TYPE.caQc, certificateBase64: deAnchor },
          { type: EU_TL_SERVICE_TYPE.eaaQ, certificateBase64: qeaaAnchor },
          { type: EU_TL_SERVICE_TYPE.qtst, certificateBase64: tsaAnchor },
          { type: EU_TL_SERVICE_TYPE.caPkc, certificateBase64: qwacCaAnchor },
          { type: EU_TL_SERVICE_TYPE.nationalRootCaQc, certificateBase64: nationalRoot },
        ]),
        deSigner,
      ),
    })
    const { service } = buildService({ lotlSigner: commission.base64 })
    expect(new Set(await ingestedAnchors(service))).toEqual(new Set([deAnchor, qeaaAnchor]))
  })

  test('EU_TRUSTED_LIST_SERVICE_TYPES only narrows the issuer set; a non-issuer type is refused', async () => {
    const qeaaAnchor = (await makeCert('DE QEAA Provider')).base64
    const signedLotl = await signXml(lotl(lotlPointer(DE_URL, deSigner.base64, 'DE')), commission)
    stubFetch({
      [LOTL_URL]: signedLotl,
      [DE_URL]: await signXml(
        nationalTlWith([
          { type: EU_TL_SERVICE_TYPE.caQc, certificateBase64: deAnchor },
          { type: EU_TL_SERVICE_TYPE.eaaQ, certificateBase64: qeaaAnchor },
        ]),
        deSigner,
      ),
    })
    const narrowed = buildService({ lotlSigner: commission.base64, serviceTypes: EU_TL_SERVICE_TYPE.eaaQ })
    expect(await ingestedAnchors(narrowed.service)).toEqual([qeaaAnchor])

    const widened = buildService({
      lotlSigner: commission.base64,
      serviceTypes: `${EU_TL_SERVICE_TYPE.caQc},${EU_TL_SERVICE_TYPE.tsa}`,
    })
    await expect(widened.service.anchorsFromLotl()).rejects.toThrow(
      /EU_TRUSTED_LIST_SERVICE_TYPES may only narrow the credential-issuer service types/,
    )
  })

  describe('fetch hardening', () => {
    test('every document is fetched with a timeout signal', async () => {
      const fetchMock = stubFetch({
        [LOTL_URL]: await signXml(lotl(lotlPointer(DE_URL, deSigner.base64, 'DE')), commission),
        [DE_URL]: await signXml(nationalTl(deAnchor), deSigner),
      })
      const { service } = buildService({ lotlSigner: commission.base64 })
      await ingestedAnchors(service)
      for (const call of fetchMock.mock.calls) {
        expect((call[1] as { signal: unknown }).signal).toBeInstanceOf(AbortSignal)
      }
    })

    test('a national TL that declares an oversized body is skipped, the rest served', async () => {
      stubFetch({
        [LOTL_URL]: await signXml(
          lotl(lotlPointer(DE_URL, deSigner.base64, 'DE'), lotlPointer(FR_URL, frSigner.base64, 'FR')),
          commission,
        ),
        [DE_URL]: await signXml(nationalTl(deAnchor), deSigner),
        [FR_URL]: textResponse(await signXml(nationalTl(frAnchor), frSigner), {
          'content-length': String(21 * 1024 * 1024),
        }),
      })
      const { service, logger } = buildService({ lotlSigner: commission.base64 })
      expect(await ingestedAnchors(service)).toEqual([deAnchor])
      const [payload] = (logger.warn as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]
      expect((payload as { dropped: { reason: string }[] }).dropped[0].reason).toMatch(
        /too large: 22020096 bytes declared/,
      )
    })

    test('a national TL whose streamed body exceeds the limit is abandoned mid-stream', async () => {
      // 3 × 16 KB chunks against a 32 KB limit: the signed LoTL and DE lists (a few KB) fit, FR does not
      const oversized = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(16 * 1024))
          controller.enqueue(new Uint8Array(16 * 1024))
          controller.enqueue(new Uint8Array(16 * 1024))
          controller.close()
        },
      })
      stubFetch({
        [LOTL_URL]: await signXml(
          lotl(lotlPointer(DE_URL, deSigner.base64, 'DE'), lotlPointer(FR_URL, frSigner.base64, 'FR')),
          commission,
        ),
        [DE_URL]: await signXml(nationalTl(deAnchor), deSigner),
        [FR_URL]: { ok: true, status: 200, headers: new Headers(), body: oversized } as unknown as Response,
      })
      const { service, logger } = buildService({ lotlSigner: commission.base64 })
      service.limits = { ...service.limits, trustedListBytes: 32 * 1024 }
      expect(await ingestedAnchors(service)).toEqual([deAnchor])
      const [payload] = (logger.warn as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]
      expect((payload as { dropped: { reason: string }[] }).dropped[0].reason).toMatch(/more than 32768 bytes/)
    })

    test('a national TL fetch that times out is skipped with a timeout reason', async () => {
      stubFetch({
        [LOTL_URL]: await signXml(
          lotl(lotlPointer(DE_URL, deSigner.base64, 'DE'), lotlPointer(FR_URL, frSigner.base64, 'FR')),
          commission,
        ),
        [DE_URL]: await signXml(nationalTl(deAnchor), deSigner),
        [FR_URL]: () => Promise.reject(Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' })),
      })
      const { service, logger } = buildService({ lotlSigner: commission.base64 })
      expect(await ingestedAnchors(service)).toEqual([deAnchor])
      const [payload] = (logger.warn as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]
      expect((payload as { dropped: { reason: string }[] }).dropped[0].reason).toMatch(/timed out after 15000 ms/)
    })

    test('national TLs are fetched at most `limits.concurrency` at a time', async () => {
      const territories = ['AT', 'BE', 'CZ', 'DK', 'EE', 'FI']
      const signers = await Promise.all(territories.map((territory) => makeCert(`${territory} Scheme Operator`)))
      const tls = await Promise.all(
        territories.map(async (territory, index) =>
          signXml(nationalTl((await makeCert(`${territory} CA`)).base64), signers[index]),
        ),
      )
      let inFlight = 0
      let maxInFlight = 0
      const routes: Record<string, Route> = {
        [LOTL_URL]: await signXml(
          lotl(
            ...territories.map((territory, index) =>
              lotlPointer(`https://${territory}.example/tl.xml`, signers[index].base64, territory),
            ),
          ),
          commission,
        ),
      }
      territories.forEach((territory, index) => {
        routes[`https://${territory}.example/tl.xml`] = async () => {
          inFlight += 1
          maxInFlight = Math.max(maxInFlight, inFlight)
          await new Promise((resolve) => setTimeout(resolve, 5))
          inFlight -= 1
          return textResponse(tls[index])
        }
      })
      stubFetch(routes)
      const { service } = buildService({ lotlSigner: commission.base64 })
      service.limits = { ...service.limits, concurrency: 2 }
      expect(await ingestedAnchors(service)).toHaveLength(6)
      expect(maxInFlight).toBe(2)
    })
  })

  describe('freshness and replay', () => {
    test('a national TL past its NextUpdate is skipped (and logged), the rest served', async () => {
      stubFetch({
        [LOTL_URL]: await signXml(
          lotl(lotlPointer(DE_URL, deSigner.base64, 'DE'), lotlPointer(FR_URL, frSigner.base64, 'FR')),
          commission,
        ),
        [DE_URL]: await signXml(nationalTl(deAnchor, { nextUpdate: inOneYear }), deSigner),
        [FR_URL]: await signXml(nationalTl(frAnchor, { nextUpdate: anHourAgo }), frSigner),
      })
      const { service, logger } = buildService({ lotlSigner: commission.base64 })
      expect(await ingestedAnchors(service)).toEqual([deAnchor])
      const [payload] = (logger.warn as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]
      expect((payload as { dropped: { territory: string; reason: string }[] }).dropped[0]).toMatchObject({
        territory: 'FR',
        reason: expect.stringMatching(/is stale: its NextUpdate .* has passed/),
      })
    })

    test('a NextUpdate that passed within the grace window is still accepted', async () => {
      const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString()
      stubFetch({
        [LOTL_URL]: await signXml(lotl(lotlPointer(DE_URL, deSigner.base64, 'DE')), commission),
        [DE_URL]: await signXml(nationalTl(deAnchor, { nextUpdate: twoMinutesAgo }), deSigner),
      })
      const { service } = buildService({ lotlSigner: commission.base64 })
      expect(await ingestedAnchors(service)).toEqual([deAnchor])
    })

    test('a LoTL past its NextUpdate aborts the whole traversal (the verifier keeps its last snapshot)', async () => {
      stubFetch({
        [LOTL_URL]: await signXml(
          lotlWith({ nextUpdate: anHourAgo }, lotlPointer(DE_URL, deSigner.base64, 'DE')),
          commission,
        ),
        [DE_URL]: await signXml(nationalTl(deAnchor), deSigner),
      })
      const { service } = buildService({ lotlSigner: commission.base64 })
      await expect(service.anchorsFromLotl()).rejects.toThrow(/List of Trusted Lists is stale/)
    })

    test('a replayed TL with a lower TSLSequenceNumber than the last accepted one is skipped; equal or higher is accepted', async () => {
      const { service, logger } = buildService({ lotlSigner: commission.base64 })
      const traverse = async (sequence: number) => {
        stubFetch({
          [LOTL_URL]: await signXml(lotl(lotlPointer(DE_URL, deSigner.base64, 'DE')), commission),
          [DE_URL]: await signXml(nationalTl(deAnchor, { sequence }), deSigner),
        })
        return ingestedAnchors(service)
      }
      expect(await traverse(10)).toEqual([deAnchor])
      expect(await traverse(9)).toEqual([]) // replay of an older issue
      expect(await traverse(10)).toEqual([deAnchor])
      expect(await traverse(11)).toEqual([deAnchor])
      expect(logger.warn).toHaveBeenCalledTimes(1)
      const [payload] = (logger.warn as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]
      expect((payload as { dropped: { reason: string }[] }).dropped[0].reason).toMatch(
        /sequence number regressed: got 9, last accepted 10/,
      )
    })
  })

  test('requires EU_LOTL_URL', async () => {
    const { service } = buildService({ lotlUrl: '', lotlSigner: commission.base64 })
    await expect(service.anchorsFromLotl()).rejects.toThrow(/EU_LOTL_URL is required/)
  })

  test('honours the SchemeTerritory allow-list (only listed Member States are traversed)', async () => {
    const signedLotl = await signXml(
      lotl(lotlPointer(DE_URL, deSigner.base64, 'DE'), lotlPointer(FR_URL, frSigner.base64, 'FR')),
      commission,
    )
    stubFetch({
      [LOTL_URL]: signedLotl,
      [DE_URL]: await signXml(nationalTl(deAnchor), deSigner),
      [FR_URL]: await signXml(nationalTl(frAnchor), frSigner),
    })
    const { service } = buildService({ lotlSigner: commission.base64, territories: 'DE' })
    expect(await ingestedAnchors(service)).toEqual([deAnchor])
  })
})
