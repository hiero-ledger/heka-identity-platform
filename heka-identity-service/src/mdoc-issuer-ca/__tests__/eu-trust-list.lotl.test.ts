import { webcrypto } from 'node:crypto'

import { createMock } from '@golevelup/ts-vitest'
import { Key, KeyAlgorithm } from '@openwallet-foundation/askar-nodejs'
import * as x509 from '@peculiar/x509'
import { DOMImplementation, DOMParser, XMLSerializer } from '@xmldom/xmldom'
import * as xadesjs from 'xadesjs'
import { setNodeDependencies } from 'xml-core'

import { Agent } from 'common/agent'
import { Logger } from 'common/logger'
import { ManagedCertificate, ManagedCertificateService } from 'x509-signing'

import { EU_GENERIC_TSL_TYPE } from '../etsi-tsl.parser'
import { EuTrustListService } from '../eu-trust-list.service'

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

/** An (unsigned) national Trusted List carrying one granted issuer anchor. */
const nationalTl = (anchorBase64: string) => `<?xml version="1.0" encoding="UTF-8"?>
<TrustServiceStatusList xmlns="http://uri.etsi.org/02231/v2#">
  <TrustServiceProviderList><TrustServiceProvider><TSPServices><TSPService><ServiceInformation>
    <ServiceTypeIdentifier>${QC}</ServiceTypeIdentifier>
    <ServiceStatus>${GRANTED}</ServiceStatus>
    <ServiceDigitalIdentity><DigitalId><X509Certificate>${anchorBase64}</X509Certificate></DigitalId></ServiceDigitalIdentity>
  </ServiceInformation></TSPService></TSPServices></TrustServiceProvider></TrustServiceProviderList>
</TrustServiceStatusList>`

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
const lotl = (...pointers: string[]) => `<?xml version="1.0" encoding="UTF-8"?>
<TrustServiceStatusList xmlns="http://uri.etsi.org/02231/v2#">
  <SchemeInformation><PointersToOtherTSL>${pointers.join('')}</PointersToOtherTSL></SchemeInformation>
</TrustServiceStatusList>`

function stubFetch(routes: Record<string, string>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      const xml = routes[url]
      if (xml == null) return { ok: false, status: 404, text: () => Promise.resolve('') } as unknown as Response
      return { ok: true, status: 200, text: () => Promise.resolve(xml) } as unknown as Response
    }),
  )
}

function buildService(config: { lotlUrl?: string; lotlSigner?: string; territories?: string }): {
  service: EuTrustListService
  logger: Logger
} {
  const signingKey = Key.generate(KeyAlgorithm.EcSecp256r1)
  const logger = createMock<Logger>()
  const agent = createMock<Agent>({
    agencyConfig: {
      euTrustListSources: ['lotl'],
      euLotlUrl: config.lotlUrl ?? LOTL_URL,
      euLotlSignerCertificates: config.lotlSigner ?? '',
      euLotlSchemeTerritories: config.territories ?? '',
      euTrustedListServiceTypes: '',
      euTrustListProvider: 'Heka',
    },
    kms: {
      sign: vi.fn(({ data }: { data: Uint8Array }) =>
        Promise.resolve({ signature: signingKey.signMessage({ message: Buffer.from(data) }) }),
      ),
      createKey: vi.fn(),
    },
    genericRecords: { update: vi.fn() },
  })
  const managedCertificateService: ManagedCertificateService = createMock<ManagedCertificateService>()
  vi.mocked(managedCertificateService.ensureCertificate).mockResolvedValue({
    keyId: 'eu-key',
    chain: [{ toString: () => 'LEAF' }, { toString: () => 'ROOT' }],
    record: { id: 'signer-rec', content: {} },
  } as unknown as ManagedCertificate)
  return { service: new EuTrustListService(agent, managedCertificateService, logger), logger }
}

async function publishedAnchors(service: EuTrustListService): Promise<string[]> {
  const jws = await service.getTrustList()
  const payload = JSON.parse(Buffer.from(jws.split('.')[1], 'base64url').toString('utf8'))
  // The published list is a TS 119 602 LoTE — walk entities → services → X509Certificates.
  return ((payload.LoTE?.TrustedEntitiesList ?? []) as Array<Record<string, any>>).flatMap((entity) =>
    ((entity.TrustedEntityServices ?? []) as Array<Record<string, any>>).flatMap((entityService) =>
      (
        (entityService.ServiceInformation?.ServiceDigitalIdentity?.X509Certificates ?? []) as Array<{ val: string }>
      ).map((certificate) => certificate.val),
    ),
  )
}

describe('EuTrustListService — LoTL traversal', () => {
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

    const anchors = await publishedAnchors(service)
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

    const anchors = await publishedAnchors(service)
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
    expect(await publishedAnchors(service)).toEqual([deAnchor])
  })

  test('fail-closed at the root: a LoTL not signed by the pinned Commission signer aborts the whole traversal', async () => {
    const signedLotl = await signXml(lotl(lotlPointer(DE_URL, deSigner.base64, 'DE')), commission)
    stubFetch({ [LOTL_URL]: signedLotl, [DE_URL]: await signXml(nationalTl(deAnchor), deSigner) })
    // Pin a DIFFERENT signer than the one that actually signed the LoTL.
    const { service } = buildService({ lotlSigner: rogue.base64 })
    await expect(service.getTrustList()).rejects.toThrow(/not a configured scheme-operator anchor/)
  })

  test('requires EU_LOTL_URL when the source is lotl', async () => {
    const { service } = buildService({ lotlUrl: '', lotlSigner: commission.base64 })
    await expect(service.getTrustList()).rejects.toThrow(/EU_LOTL_URL is required/)
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
    expect(await publishedAnchors(service)).toEqual([deAnchor])
  })
})
