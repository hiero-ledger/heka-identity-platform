import type { GenericRecord } from '@credo-ts/core'

import { webcrypto } from 'node:crypto'

import { createMock } from '@golevelup/ts-vitest'
import { Key, KeyAlgorithm } from '@openwallet-foundation/askar-nodejs'
import * as x509 from '@peculiar/x509'

import { Agent } from 'common/agent'
import { Logger } from 'common/logger'
import { SDJWT_ISSUER_REGISTRY_RECORD_TYPE } from 'sdjwt-vc-issuer'
import { ManagedCertificate, ManagedCertificateService, X509SignerService } from 'x509-signing'

import { EU_LOTE_SERVICE_TYPE } from '../eu-service-types'
import { IACA_REGISTRY_RECORD_TYPE } from '../iaca-registry'
import { HEKA_LOTE, SchemeTrustListService } from '../scheme-trust-list.service'

const crypto = webcrypto as unknown as Crypto
x509.cryptoProvider.set(crypto)

const generateCertB64 = async (commonName: string): Promise<string> => {
  const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const cert = await x509.X509CertificateGenerator.createSelfSigned(
    {
      keys,
      name: `CN=${commonName}`,
      notBefore: new Date('2026-01-01T00:00:00Z'),
      notAfter: new Date('2031-01-01T00:00:00Z'),
    },
    crypto,
  )
  return Buffer.from(cert.rawData).toString('base64')
}

type Service = {
  ServiceInformation: {
    ServiceTypeIdentifier?: string
    ServiceStatus?: string
    ServiceDigitalIdentity?: { X509Certificates?: { val: string }[] }
    ServiceInformationExtensions?: Record<string, unknown>[]
  }
}
type Entity = {
  TrustedEntityInformation: { TEName: { value: string }[]; TEInformationURI?: { uriValue: string }[] }
  TrustedEntityServices: Service[]
}

const decodePayload = (jws: string) =>
  JSON.parse(Buffer.from(jws.split('.')[1], 'base64url').toString('utf8')) as {
    LoTE: { ListAndSchemeInformation: Record<string, unknown>; TrustedEntitiesList: Entity[] }
  }
const servicesOf = (jws: string): Service[] =>
  decodePayload(jws).LoTE.TrustedEntitiesList.flatMap((entity) => entity.TrustedEntityServices)
const certsOf = (jws: string): string[] =>
  servicesOf(jws).flatMap((service) =>
    (service.ServiceInformation.ServiceDigitalIdentity?.X509Certificates ?? []).map((certificate) => certificate.val),
  )

describe('SchemeTrustListService — the Heka scheme trust lists', () => {
  let leafB64: string
  let rootB64: string
  let iacaA: string
  let iacaB: string
  let sdJwtA: string
  let partner: string
  let signingKey: Key

  beforeAll(async () => {
    leafB64 = await generateCertB64('Heka Scheme Trust List Signer')
    rootB64 = await generateCertB64('Heka Service Root CA')
    iacaA = await generateCertB64('Tenant A IACA')
    iacaB = await generateCertB64('Tenant B IACA')
    sdJwtA = await generateCertB64('Tenant A SD-JWT issuer')
    partner = await generateCertB64('Partner Issuer CA')
  })

  const record = (content: Record<string, unknown>): GenericRecord => ({ content }) as unknown as GenericRecord

  const build = (
    options: {
      iacas?: {
        tenantContextId: string
        certificateBase64: string
        authorityName: string
        country: string
        docType: string
      }[]
      sdJwtIssuers?: { tenantContextId: string; certificateBase64: string; domain: string }[]
      partnerCertificates?: string
      serviceRoot?: string | null
      pointers?: { location: string; signerCertificates: string[] }[]
    } = {},
  ) => {
    signingKey = Key.generate(KeyAlgorithm.EcSecp256r1)
    const registries = {
      [IACA_REGISTRY_RECORD_TYPE]: (options.iacas ?? []).map(record),
      [SDJWT_ISSUER_REGISTRY_RECORD_TYPE]: (options.sdJwtIssuers ?? []).map(record),
    }
    const findAllByQuery = vi.fn(({ recordType }: { recordType: string }) =>
      Promise.resolve(registries[recordType as keyof typeof registries] ?? []),
    )
    const agent = createMock<Agent>({
      agencyConfig: {
        trustListSchemeOperator: 'Heka',
        trustListPartnerCertificates: options.partnerCertificates ?? '',
        trustListPointers: options.pointers ?? [],
        mdocIssuerCountry: 'US',
      },
      kms: {
        // Back the KMS sign with a real askar P-256 key (raw r‖s ES256 signature, as JWS expects).
        sign: vi.fn(({ data }: { data: Uint8Array }) =>
          Promise.resolve({ signature: signingKey.signMessage({ message: Buffer.from(data) }) }),
        ),
      },
      genericRecords: { findAllByQuery, update: vi.fn() },
    } as unknown as Partial<Agent>)
    const managed: ManagedCertificateService = createMock<ManagedCertificateService>()
    vi.mocked(managed.ensureCertificate).mockResolvedValue({
      keyId: 'list-key',
      chain: [{ toString: () => leafB64 }, { toString: () => rootB64 }],
      record: { id: 'signer-rec', content: {} },
    } as unknown as ManagedCertificate)
    const x509SignerService: X509SignerService = createMock<X509SignerService>()
    vi.mocked(x509SignerService.getServiceRootCertificate).mockResolvedValue(
      options.serviceRoot === null ? null : { certificateBase64: options.serviceRoot ?? rootB64, fingerprint: 'fp' },
    )
    const service = new SchemeTrustListService(agent, managed, x509SignerService, createMock<Logger>())
    return { service, registries, findAllByQuery }
  }

  test('eaa-providers: one entity per tenant (IACA + SD-JWT issuer), partners tagged as such, EU EAA service type throughout', async () => {
    const { service } = build({
      iacas: [
        {
          tenantContextId: 'tenant-a',
          certificateBase64: iacaA,
          authorityName: 'Tenant A',
          country: 'DE',
          docType: 'org.iso.18013.5.1.mDL',
        },
        {
          tenantContextId: 'tenant-b',
          certificateBase64: iacaB,
          authorityName: 'Tenant B',
          country: 'FR',
          docType: 'eu.europa.ec.eudi.pid.1',
        },
      ],
      sdJwtIssuers: [{ tenantContextId: 'tenant-a', certificateBase64: sdJwtA, domain: 'a.example' }],
      partnerCertificates: partner,
    })
    const jws = await service.getList('eaa-providers')
    const [h, p, s] = jws.split('.')

    const header = JSON.parse(Buffer.from(h, 'base64url').toString('utf8'))
    expect(header).toMatchObject({ alg: 'ES256', typ: 'trustlist+jwt', kid: 'list-key' })
    expect(header.x5c).toEqual([leafB64, rootB64]) // signer leaf → service root

    const { LoTE } = decodePayload(jws)
    expect(LoTE.ListAndSchemeInformation).toMatchObject({
      LoTEType: HEKA_LOTE.type['eaa-providers'],
      SchemeOperatorName: [{ lang: 'en', value: 'Heka' }],
      StatusDeterminationApproach: HEKA_LOTE.statusDeterminationApproach,
      LoTESequenceNumber: 1,
    })

    expect(LoTE.TrustedEntitiesList).toHaveLength(3) // tenant-a, tenant-b, partner
    const tenantA = LoTE.TrustedEntitiesList.find(
      (entity) => entity.TrustedEntityInformation.TEName[0].value === 'Tenant A',
    )
    expect(tenantA?.TrustedEntityServices).toHaveLength(2)
    expect(tenantA?.TrustedEntityInformation.TEInformationURI?.[0].uriValue).toBe(
      'http://uri.etsi.org/19602/ListOfTrustedEntities/EAAProvider/DE',
    )
    const services = servicesOf(jws)
    expect(
      services.every((entry) => entry.ServiceInformation.ServiceTypeIdentifier === EU_LOTE_SERVICE_TYPE.eaaIssuance),
    ).toBe(true)
    expect(new Set(certsOf(jws))).toEqual(new Set([iacaA, iacaB, sdJwtA, partner]))

    const membership = (certificate: string) =>
      services.find(
        (entry) => entry.ServiceInformation.ServiceDigitalIdentity?.X509Certificates?.[0].val === certificate,
      )?.ServiceInformation.ServiceInformationExtensions?.[0]
    expect(membership(iacaA)).toMatchObject({
      type: HEKA_LOTE.membershipExtension,
      origin: 'tenant',
      formats: ['mso_mdoc'],
      docTypes: ['org.iso.18013.5.1.mDL'],
    })
    expect(membership(sdJwtA)).toMatchObject({ origin: 'tenant', formats: ['dc+sd-jwt'] })
    expect(membership(partner)).toMatchObject({ origin: 'partner' })
    // never the service root among the issuer anchors
    expect(certsOf(jws)).not.toContain(rootB64)

    // The signature verifies over the JWS signing input (`header.payload`).
    expect(
      signingKey.verifySignature({ message: Buffer.from(`${h}.${p}`, 'utf8'), signature: Buffer.from(s, 'base64url') }),
    ).toBe(true)
  })

  test('wrpac-providers: the service root as the scheme access-certificate authority; empty until the root exists', async () => {
    const { service } = build({ serviceRoot: rootB64 })
    const jws = await service.getList('wrpac-providers')
    const services = servicesOf(jws)
    expect(services).toHaveLength(1)
    expect(services[0].ServiceInformation.ServiceTypeIdentifier).toBe(EU_LOTE_SERVICE_TYPE.wrpacIssuance)
    expect(certsOf(jws)).toEqual([rootB64])
    expect(services[0].ServiceInformation.ServiceInformationExtensions?.[0]).toMatchObject({ origin: 'operator' })
    expect(decodePayload(jws).LoTE.ListAndSchemeInformation.LoTEType).toBe(HEKA_LOTE.type['wrpac-providers'])

    const noRoot = build({ serviceRoot: null })
    expect(decodePayload(await noRoot.service.getList('wrpac-providers')).LoTE.TrustedEntitiesList).toEqual([])
  })

  test('nothing is republished: no ingestion of upstream lists is involved, an empty scheme yields an empty signed list', async () => {
    const { service } = build()
    expect(decodePayload(await service.getList('eaa-providers')).LoTE.TrustedEntitiesList).toEqual([])
  })

  test('caches while the content is unchanged and rebuilds (next sequence number) when a tenant is added', async () => {
    const { service, registries } = build({
      iacas: [
        {
          tenantContextId: 'tenant-a',
          certificateBase64: iacaA,
          authorityName: 'Tenant A',
          country: 'DE',
          docType: 'd',
        },
      ],
    })
    const first = await service.getList('eaa-providers')
    expect(await service.getList('eaa-providers')).toBe(first)

    registries[IACA_REGISTRY_RECORD_TYPE].push(
      record({
        tenantContextId: 'tenant-b',
        certificateBase64: iacaB,
        authorityName: 'Tenant B',
        country: 'FR',
        docType: 'd',
      }),
    )
    const second = await service.getList('eaa-providers')
    expect(second).not.toBe(first)
    expect(decodePayload(second).LoTE.ListAndSchemeInformation.LoTESequenceNumber).toBe(2)
    expect(new Set(certsOf(second))).toEqual(new Set([iacaA, iacaB]))
  })

  test('index lists both scheme lists and the configured external pointers; unknown ids are 404', async () => {
    const pointer = { location: 'https://ec.example/lote/pid-providers.jwt', signerCertificates: ['COMMISSION'] }
    const { service } = build({ pointers: [pointer] })
    expect(service.getIndex()).toEqual({
      schemeOperator: 'Heka',
      lists: [
        {
          id: 'eaa-providers',
          loteType: HEKA_LOTE.type['eaa-providers'],
          path: '/trust-list/eaa-providers',
          mimeType: 'application/trustlist+jwt',
        },
        {
          id: 'wrpac-providers',
          loteType: HEKA_LOTE.type['wrpac-providers'],
          path: '/trust-list/wrpac-providers',
          mimeType: 'application/trustlist+jwt',
        },
      ],
      pointers: [pointer],
    })
    await expect(service.getList('qtsp-providers')).rejects.toThrow(/Unknown trust list/)
  })
})
