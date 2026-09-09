import type { LoTEDocument } from '@owf/eudi-lote'

import { webcrypto } from 'node:crypto'

import { createMock } from '@golevelup/ts-vitest'
import { Key, KeyAlgorithm } from '@openwallet-foundation/askar-nodejs'
import { createLoTE, signLoTE } from '@owf/eudi-lote'
import * as x509 from '@peculiar/x509'

import { Agent } from 'common/agent'
import { Logger } from 'common/logger'
import { ManagedCertificate, ManagedCertificateService } from 'x509-signing'

import { EuTrustListService } from '../eu-trust-list.service'

const crypto = webcrypto as unknown as Crypto
x509.cryptoProvider.set(crypto)

const alg = { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' } as const
const GRANTED = 'http://uri.etsi.org/TrstSvc/Svcstatus/granted'
const WITHDRAWN = 'http://uri.etsi.org/TrstSvc/Svcstatus/withdrawn'
const PID_ISSUANCE = 'http://uri.etsi.org/19602/SvcType/PID/Issuance'

const LOTE_URL = 'https://ec.example/lote/pid-providers.json'
const SECOND_LOTE_URL = 'https://ec.example/lote/eaa-providers.json'

type Cert = { keys: CryptoKeyPair; base64: string }

async function makeCert(cn: string): Promise<Cert> {
  const keys = await crypto.subtle.generateKey(alg, true, ['sign', 'verify'])
  const cert = await x509.X509CertificateGenerator.createSelfSigned(
    { keys, name: `CN=${cn}`, notBefore: new Date('2026-01-01Z'), notAfter: new Date('2031-01-01Z') },
    crypto,
  )
  return { keys, base64: Buffer.from(cert.rawData).toString('base64') }
}

/** Build a LoTE document listing the given anchors as granted PID-issuance providers. */
function loteFixture(anchors: Array<{ certificateBase64: string; status?: string }>): LoTEDocument {
  return createLoTE(
    { SchemeOperatorName: [{ lang: 'en', value: 'Test Scheme Operator' }] },
    anchors.map((anchor, index) => ({
      TrustedEntityInformation: {
        TEName: [{ lang: 'en', value: `Provider ${index + 1}` }],
        TEAddress: { TEPostalAddress: [], TEElectronicAddress: [] },
      },
      TrustedEntityServices: [
        {
          ServiceInformation: {
            ServiceName: [{ lang: 'en', value: 'PID Issuance' }],
            ServiceTypeIdentifier: PID_ISSUANCE,
            ServiceStatus: anchor.status ?? GRANTED,
            StatusStartingTime: new Date().toISOString(),
            ServiceDigitalIdentity: { X509Certificates: [{ val: anchor.certificateBase64 }] },
          },
        },
      ],
    })),
  )
}

/** Sign a LoTE fixture with `signer`'s webcrypto key, carrying its cert in the x5c header. */
async function signLote(document: LoTEDocument, signer: Cert): Promise<string> {
  const { jws } = await signLoTE({
    lote: document,
    keyId: 'fixture-signer',
    certificates: [`-----BEGIN CERTIFICATE-----\n${signer.base64}\n-----END CERTIFICATE-----`],
    signer: async (data) =>
      Buffer.from(await crypto.subtle.sign(alg, signer.keys.privateKey, Buffer.from(data, 'utf8'))).toString(
        'base64url',
      ),
  })
  return jws
}

function stubFetch(routes: Record<string, string>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      const body = routes[url]
      if (body == null) return { ok: false, status: 404, text: () => Promise.resolve('') } as unknown as Response
      return { ok: true, status: 200, text: () => Promise.resolve(body) } as unknown as Response
    }),
  )
}

function buildService(config: {
  sources?: ('config' | 'lotl' | 'lote')[]
  loteUrls?: string
  loteSigner?: string
  serviceTypes?: string
  configuredAnchors?: string
}): { service: EuTrustListService; logger: Logger } {
  const signingKey = Key.generate(KeyAlgorithm.EcSecp256r1)
  const logger = createMock<Logger>()
  const agent = createMock<Agent>({
    agencyConfig: {
      euTrustListSources: config.sources ?? ['lote'],
      euLoteUrls: config.loteUrls ?? LOTE_URL,
      euLoteSignerCertificates: config.loteSigner ?? '',
      euLoteServiceTypes: config.serviceTypes ?? '',
      euTrustedIssuerCertificates: config.configuredAnchors ?? '',
      euTrustListProvider: 'Heka',
    },
    kms: {
      sign: vi.fn(({ data }: { data: Uint8Array }) =>
        Promise.resolve({ signature: signingKey.signMessage({ message: Buffer.from(data) }) }),
      ),
      // Real ES256 verification via webcrypto against the JWK the service extracted from the x5c leaf.
      verify: vi.fn(
        async ({
          key,
          data,
          signature,
        }: {
          key: { publicJwk: JsonWebKey }
          data: Uint8Array
          signature: Uint8Array
        }) => {
          const cryptoKey = await crypto.subtle.importKey(
            'jwk',
            key.publicJwk,
            { name: 'ECDSA', namedCurve: 'P-256' },
            false,
            ['verify'],
          )
          return {
            verified: await crypto.subtle.verify(alg, cryptoKey, Uint8Array.from(signature), Uint8Array.from(data)),
          }
        },
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
  return ((payload.LoTE?.TrustedEntitiesList ?? []) as Array<Record<string, any>>).flatMap((entity) =>
    ((entity.TrustedEntityServices ?? []) as Array<Record<string, any>>).flatMap((entityService) =>
      (
        (entityService.ServiceInformation?.ServiceDigitalIdentity?.X509Certificates ?? []) as Array<{ val: string }>
      ).map((certificate) => certificate.val),
    ),
  )
}

describe('EuTrustListService — LoTE ingestion', () => {
  let operator: Cert
  let rogue: Cert
  let pidAnchor: string
  let eaaAnchor: string
  let configAnchor: string

  beforeAll(async () => {
    operator = await makeCert('Test Scheme Operator LoTE Signer')
    rogue = await makeCert('Rogue Signer')
    pidAnchor = (await makeCert('DE PID Issuer CA')).base64
    eaaAnchor = (await makeCert('FR EAA Issuer CA')).base64
    configAnchor = (await makeCert('Curated EU Issuer CA')).base64
  })

  afterEach(() => vi.unstubAllGlobals())

  test('ingests a pinned, valid LoTE and republishes its granted anchors', async () => {
    stubFetch({ [LOTE_URL]: await signLote(loteFixture([{ certificateBase64: pidAnchor }]), operator) })
    const { service } = buildService({ loteSigner: operator.base64 })
    expect(await publishedAnchors(service)).toEqual([pidAnchor])
  })

  test('fail-closed: a LoTE signed by an unpinned (rogue) signer is rejected', async () => {
    stubFetch({ [LOTE_URL]: await signLote(loteFixture([{ certificateBase64: pidAnchor }]), rogue) })
    const { service } = buildService({ loteSigner: operator.base64 })
    await expect(service.getTrustList()).rejects.toThrow(/not a pinned trust anchor/)
  })

  test('fail-closed: a JWS with the wrong typ is rejected', async () => {
    const valid = await signLote(loteFixture([{ certificateBase64: pidAnchor }]), operator)
    const [, payloadB64, sigB64] = valid.split('.')
    const wrongTyp = `${Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'jwt', x5c: [operator.base64] })).toString('base64url')}.${payloadB64}.${sigB64}`
    stubFetch({ [LOTE_URL]: wrongTyp })
    const { service } = buildService({ loteSigner: operator.base64 })
    await expect(service.getTrustList()).rejects.toThrow(/unexpected typ/)
  })

  test('fail-closed: a schema-invalid LoTE payload is rejected after signature verification', async () => {
    // Well-signed JWS whose payload is not a valid TS 119 602 document.
    const header = Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'trustlist+jwt', x5c: [operator.base64] })).toString(
      'base64url',
    )
    const payload = Buffer.from(JSON.stringify({ not: 'a lote' })).toString('base64url')
    const signature = Buffer.from(
      await crypto.subtle.sign(alg, operator.keys.privateKey, Buffer.from(`${header}.${payload}`, 'utf8')),
    ).toString('base64url')
    stubFetch({ [LOTE_URL]: `${header}.${payload}.${signature}` })
    const { service } = buildService({ loteSigner: operator.base64 })
    await expect(service.getTrustList()).rejects.toThrow()
  })

  test('a withdrawn service is excluded from the extracted anchors', async () => {
    const document = loteFixture([
      { certificateBase64: pidAnchor },
      { certificateBase64: eaaAnchor, status: WITHDRAWN },
    ])
    stubFetch({ [LOTE_URL]: await signLote(document, operator) })
    const { service } = buildService({ loteSigner: operator.base64 })
    expect(await publishedAnchors(service)).toEqual([pidAnchor])
  })

  test('multi-source union: curated config anchors + LoTE anchors are published together', async () => {
    stubFetch({ [LOTE_URL]: await signLote(loteFixture([{ certificateBase64: pidAnchor }]), operator) })
    const { service } = buildService({
      sources: ['config', 'lote'],
      loteSigner: operator.base64,
      configuredAnchors: configAnchor,
    })
    const anchors = await publishedAnchors(service)
    expect(new Set(anchors)).toEqual(new Set([configAnchor, pidAnchor]))
  })

  test('best-effort union across lists: an unreachable LoTE is skipped (and logged), the rest served', async () => {
    stubFetch({
      [LOTE_URL]: await signLote(loteFixture([{ certificateBase64: pidAnchor }]), operator),
      // SECOND_LOTE_URL intentionally unrouted → HTTP 404.
    })
    const { service, logger } = buildService({
      loteUrls: `${LOTE_URL},${SECOND_LOTE_URL}`,
      loteSigner: operator.base64,
    })
    expect(await publishedAnchors(service)).toEqual([pidAnchor])
    expect(logger.warn).toHaveBeenCalled()
  })

  test('requires EU_LOTE_URLS when the sources include lote', async () => {
    const { service } = buildService({ loteUrls: '', loteSigner: operator.base64 })
    await expect(service.getTrustList()).rejects.toThrow(/EU_LOTE_URLS is required/)
  })
})
