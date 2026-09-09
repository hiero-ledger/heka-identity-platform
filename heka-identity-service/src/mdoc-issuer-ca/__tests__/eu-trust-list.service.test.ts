import { webcrypto } from 'node:crypto'

import { createMock } from '@golevelup/ts-vitest'
import { Key, KeyAlgorithm } from '@openwallet-foundation/askar-nodejs'
import * as x509 from '@peculiar/x509'

import { Agent } from 'common/agent'
import { Logger } from 'common/logger'
import { ManagedCertificate, ManagedCertificateService } from 'x509-signing'

import { EuTrustListService } from '../eu-trust-list.service'

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
      extensions: [],
    },
    crypto,
  )
  return Buffer.from(cert.rawData).toString('base64')
}

/** Extract the anchor certificates (base64 DER) from a published LoTE payload. */
const loteAnchors = (payload: Record<string, any>): string[] =>
  ((payload.LoTE?.TrustedEntitiesList ?? []) as Array<Record<string, any>>).flatMap((entity) =>
    ((entity.TrustedEntityServices ?? []) as Array<Record<string, any>>).flatMap((entityService) =>
      (
        (entityService.ServiceInformation?.ServiceDigitalIdentity?.X509Certificates ?? []) as Array<{ val: string }>
      ).map((certificate) => certificate.val),
    ),
  )

describe('EuTrustListService — signed LoTE JWT build', () => {
  let leafB64: string
  let rootB64: string
  let anchorB64: string
  let signingKey: Key

  beforeAll(async () => {
    leafB64 = await generateCertB64('Heka EU Trust List Signer')
    rootB64 = await generateCertB64('Heka Service Root CA')
    anchorB64 = await generateCertB64('EU PID Issuer CA')
  })

  // The managed EU-list signer: [leaf, root] chain whose base64 forms land in the JWS x5c header; the
  // backing record carries the LoTE sequence counter.
  const buildManagedSigner = () => {
    const managed: ManagedCertificateService = createMock<ManagedCertificateService>()
    vi.mocked(managed.ensureCertificate).mockResolvedValue({
      keyId: 'eu-key',
      chain: [{ toString: () => leafB64 }, { toString: () => rootB64 }],
      record: { id: 'signer-rec', content: {} },
    } as unknown as ManagedCertificate)
    return managed
  }

  const buildService = (euTrustedIssuerCertificates: string) => {
    signingKey = Key.generate(KeyAlgorithm.EcSecp256r1)
    const agent = createMock<Agent>({
      agencyConfig: {
        euTrustListSources: ['config'],
        euTrustedIssuerCertificates,
        euTrustListProvider: 'Heka',
      },
      kms: {
        // Back the KMS sign with a real askar P-256 key (raw r‖s ES256 signature, as JWS expects).
        sign: vi.fn(({ data }: { data: Uint8Array }) =>
          Promise.resolve({ signature: signingKey.signMessage({ message: Buffer.from(data) }) }),
        ),
        createKey: vi.fn(),
      },
      genericRecords: { update: vi.fn() },
    })
    return new EuTrustListService(agent, buildManagedSigner(), createMock<Logger>())
  }

  test('produces a LoTE JWT whose header, TS 119 602 payload, and ES256 signature are well-formed', async () => {
    const service = buildService(anchorB64)
    const jws = await service.getTrustList()

    const [h, p, s] = jws.split('.')
    expect([h, p, s].every((part) => part && part.length > 0)).toBe(true)

    const header = JSON.parse(Buffer.from(h, 'base64url').toString('utf8'))
    expect(header).toMatchObject({ alg: 'ES256', typ: 'trustlist+jwt', kid: 'eu-key' })
    expect(header.x5c).toEqual([leafB64, rootB64]) // signer leaf → service root

    const payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'))
    expect(payload.LoTE.ListAndSchemeInformation).toMatchObject({
      SchemeOperatorName: [{ lang: 'en', value: 'Heka' }],
      LoTESequenceNumber: 1,
    })
    expect(loteAnchors(payload)).toEqual([anchorB64])
    const status = String(payload.LoTE.TrustedEntitiesList[0].TrustedEntityServices[0].ServiceInformation.ServiceStatus)
    expect(status.endsWith('granted')).toBe(true)

    // The signature verifies over the JWS signing input (`header.payload`).
    const verified = signingKey.verifySignature({
      message: Buffer.from(`${h}.${p}`, 'utf8'),
      signature: Buffer.from(s, 'base64url'),
    })
    expect(verified).toBe(true)
  })

  test('serves an empty-but-signed LoTE when no anchors are configured', async () => {
    const service = buildService('')
    const jws = await service.getTrustList()
    const payload = JSON.parse(Buffer.from(jws.split('.')[1], 'base64url').toString('utf8'))
    expect(payload.LoTE.TrustedEntitiesList).toEqual([])
  })

  test('caches within the nextUpdate window (repeated calls return the same JWT)', async () => {
    const service = buildService(anchorB64)
    const first = await service.getTrustList()
    const second = await service.getTrustList()
    expect(first).toBe(second)
  })
})
