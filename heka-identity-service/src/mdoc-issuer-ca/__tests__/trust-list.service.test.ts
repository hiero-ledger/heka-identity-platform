import { X509Certificate } from '@credo-ts/core'
import { createMock } from '@golevelup/ts-vitest'

import { Agent } from 'common/agent'
import { ManagedCertificate, ManagedCertificateService } from 'x509-signing'

import { TrustListService } from '../trust-list.service'
import { decodeCoseSign1 } from '../vical/cose-sign1'
import { decodeVicalPayload } from '../vical/vical'

describe('TrustListService', () => {
  let service: TrustListService
  let agent: Agent
  let managedCertificateService: ManagedCertificateService

  const mockSign = vi.fn()
  const mockFindAllByQuery = vi.fn()
  const mockUpdate = vi.fn()

  let signerRecords: Array<{ id: string; content: Record<string, unknown> }>
  let registryRecords: Array<{ id: string; content: Record<string, unknown> }>

  const buildCert = () => ({
    keyId: undefined as string | undefined,
    publicJwk: { marker: 'pub' },
    rawCertificate: new Uint8Array([0x30, 0x01, 0x02]),
    subjectKeyIdentifier: 'aabbcc',
    data: {
      serialNumber: '1234567890abcdef',
      notBefore: new Date('2026-01-01T00:00:00Z'),
      notAfter: new Date('2031-01-01T00:00:00Z'),
    },
    toString: vi.fn().mockReturnValue('CERT_B64'),
  })

  beforeEach(() => {
    vi.clearAllMocks()
    signerRecords = []
    registryRecords = [
      {
        id: 'reg-1',
        content: {
          tenantContextId: 'tenant-1',
          certificateBase64: 'IACA_B64',
          authorityName: 'Heka',
          country: 'US',
          docType: 'org.iso.18013.5.1.mDL',
        },
      },
    ]

    mockFindAllByQuery.mockImplementation((query: { recordType: string }) =>
      Promise.resolve(query.recordType === 'mdoc-vical-signer' ? signerRecords : registryRecords),
    )
    mockSign.mockResolvedValue({ signature: new Uint8Array(64) })

    vi.spyOn(X509Certificate, 'fromEncodedCertificate').mockImplementation(() => buildCert() as never)

    // The managed signer: the provider "provisions" once (pushing the backing record into the global
    // store, so getVicalSignerCertificate can read it) and returns the same record on every call.
    const signerRecord = {
      id: 'signer-rec',
      content: { keyId: 'vical-key', certificateBase64: 'CERT_B64', rootCertificateBase64: 'ROOT_B64' } as Record<
        string,
        unknown
      >,
    }
    managedCertificateService = createMock<ManagedCertificateService>()
    vi.mocked(managedCertificateService.ensureCertificate).mockImplementation(() => {
      if (signerRecords.length === 0) signerRecords.push(signerRecord)
      return Promise.resolve({
        keyId: 'vical-key',
        certificate: buildCert(),
        root: buildCert(),
        chain: [buildCert(), buildCert()],
        record: signerRecord,
      } as unknown as ManagedCertificate)
    })

    agent = createMock<Agent>({
      kms: { sign: mockSign },
      genericRecords: { findAllByQuery: mockFindAllByQuery, update: mockUpdate },
      agencyConfig: { mdocIssuerAuthority: 'Heka', vicalEnabled: true },
    })

    service = new TrustListService(agent, managedCertificateService)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('builds a COSE_Sign1 VICAL: managed signer under the service root, listing the registry IACAs', async () => {
    const bytes = await service.getVical()

    // The signer is the managed service-root-signed leaf (provisioned/renewed by the provider).
    expect(managedCertificateService.ensureCertificate).toHaveBeenCalledWith(expect.anything(), {
      recordType: 'mdoc-vical-signer',
      commonName: 'Heka VICAL Signer',
      validityDays: 365,
    })
    // Signed with the VICAL signer key via ES256
    expect(mockSign).toHaveBeenCalledWith(expect.objectContaining({ keyId: 'vical-key', algorithm: 'ES256' }))

    const { unprotectedHeader, payload, signature } = decodeCoseSign1(bytes)
    expect(signature.length).toBe(64)
    // x5chain (label 33) present: [signer-leaf, service-root]
    const x5chain = (
      unprotectedHeader instanceof Map ? unprotectedHeader.get(33) : unprotectedHeader['33']
    ) as Uint8Array[]
    expect(x5chain).toHaveLength(2)

    const vical = decodeVicalPayload(payload)
    expect(vical.version).toBe('1.0')
    expect(vical.vicalProvider).toBe('Heka')
    expect(vical.vicalIssueID).toBe(1)
    const infos = vical.certificateInfos as Array<Record<string, unknown>>
    expect(infos).toHaveLength(1)
    expect(infos[0].docType).toEqual(['org.iso.18013.5.1.mDL'])
    expect(infos[0].issuingCountry).toBe('US')
    expect(infos[0].serialNumber).toBe(BigInt('0x1234567890abcdef'))
  })

  test('caches the signed VICAL across calls (one build, one signer resolution)', async () => {
    await service.getVical()
    await service.getVical()

    expect(managedCertificateService.ensureCertificate).toHaveBeenCalledTimes(1)
    expect(mockSign).toHaveBeenCalledTimes(1)
  })

  test('rebuilds after invalidate(), bumping the issue id on the same signer record', async () => {
    const first = decodeVicalPayload(decodeCoseSign1(await service.getVical()).payload)
    service.invalidate()
    const second = decodeVicalPayload(decodeCoseSign1(await service.getVical()).payload)

    expect(mockSign).toHaveBeenCalledTimes(2) // rebuilt
    expect(first.vicalIssueID).toBe(1)
    expect(second.vicalIssueID).toBe(2) // counter preserved on the managed record
  })

  test('while VICAL_ENABLED is off (the default), getVical rejects and no signer is ever provisioned', async () => {
    agent = createMock<Agent>({
      kms: { sign: mockSign },
      genericRecords: { findAllByQuery: mockFindAllByQuery, update: mockUpdate },
      agencyConfig: { mdocIssuerAuthority: 'Heka', vicalEnabled: false },
    })
    service = new TrustListService(agent, managedCertificateService)

    expect(service.enabled).toBe(false)
    await expect(service.getVical()).rejects.toThrow(/VICAL_ENABLED/)
    service.invalidate() // a new IACA while disabled is a harmless no-op
    await expect(service.getVical()).rejects.toThrow(/VICAL_ENABLED/)

    expect(managedCertificateService.ensureCertificate).not.toHaveBeenCalled()
    expect(mockSign).not.toHaveBeenCalled()
    expect(await service.getVicalSignerCertificate()).toBeNull()
  })

  test('getVicalSignerCertificate returns the signer leaf + service root once provisioned', async () => {
    expect(await service.getVicalSignerCertificate()).toBeNull()

    await service.getVical() // provisions the signer

    expect(await service.getVicalSignerCertificate()).toEqual({
      certificateBase64: 'CERT_B64',
      rootCertificateBase64: 'ROOT_B64',
    })
  })
})
