import { createHash } from 'node:crypto'

import { GenericRecordsApi, Kms, X509Api, X509Certificate, X509ExtendedKeyUsage, X509KeyUsage } from '@credo-ts/core'
import { createMock } from '@golevelup/ts-vitest'
import { BadRequestException } from '@nestjs/common'

import { Agent } from 'common/agent'

import { ID_ETSI_QCT_PID_OID, MDL_DOCUMENT_SIGNER_EKU_OID } from '../certificate-profiles'
import { buildEuDsc, buildEuIaca } from '../eu-certificate-builder'
import { MdocIssuerCaService } from '../mdoc-issuer-ca.service'
import { VicalService } from '../vical.service'

// Mock the EU certificate builder (real peculiar + KMS) so this stays a pure unit test; the builder itself
// is covered by eu-certificate-builder.test.ts.
vi.mock('../eu-certificate-builder', () => ({
  buildEuIaca: vi.fn(),
  buildEuDsc: vi.fn(),
}))

const POLICY_OID = '1.3.6.1.4.1.99999.2'

describe('MdocIssuerCaService', () => {
  let service: MdocIssuerCaService
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let agentContext: any
  let globalAgent: Agent

  const mockCreateKey = vi.fn()
  const mockCreateCertificate = vi.fn()
  const mockSave = vi.fn()
  const mockFindAllByQuery = vi.fn()
  const mockUpdate = vi.fn()
  const mockGlobalFindAllByQuery = vi.fn()
  const mockGlobalSave = vi.fn()
  const mockGlobalUpdate = vi.fn()

  const kmsApi = { createKey: mockCreateKey }
  const x509Api = { createCertificate: mockCreateCertificate }
  const recordsApi = { save: mockSave, findAllByQuery: mockFindAllByQuery, update: mockUpdate }

  let iacaRecords: Array<{ id: string; content: Record<string, unknown> }>
  let dscRecords: Array<{ id: string; content: Record<string, unknown>; setTag: ReturnType<typeof vi.fn> }>

  const buildCert = (overrides: Record<string, unknown> = {}) => ({
    keyId: undefined as string | undefined,
    publicJwk: { marker: 'cert-public-jwk' },
    getThumbprintInHex: vi.fn().mockResolvedValue('fp-abc'),
    toString: vi.fn().mockReturnValue('CERT_B64'),
    ...overrides,
  })

  const iacaContent = (overrides: Record<string, unknown> = {}) => ({
    keyId: 'iaca-key',
    certificateBase64: 'IACA_B64',
    fingerprint: 'iaca-fp',
    commonName: 'Heka mDL IACA',
    country: 'US',
    authorityName: 'Heka',
    docType: 'org.iso.18013.5.1.mDL',
    createdAt: '2026-01-01T00:00:00.000Z',
    notAfter: '2031-01-01T00:00:00.000Z',
    ...overrides,
  })

  beforeEach(() => {
    vi.clearAllMocks()
    iacaRecords = []
    dscRecords = []

    mockFindAllByQuery.mockImplementation((query: { recordType: string; isCurrent?: string }) => {
      if (query.recordType === 'mdoc-iaca') return Promise.resolve(iacaRecords)
      if (query.recordType === 'mdoc-dsc') {
        return Promise.resolve(query.isCurrent === 'true' ? dscRecords.filter((r) => r.content.isCurrent) : dscRecords)
      }
      return Promise.resolve([])
    })
    mockGlobalFindAllByQuery.mockResolvedValue([])
    // Simulate Askar persistence so records saved in one step are visible to the next (e.g. ensure()).
    mockSave.mockImplementation(
      ({ content, tags }: { content: Record<string, unknown>; tags?: { recordType?: string } }) => {
        const record = { id: 'new-rec', content, setTag: vi.fn() }
        if (tags?.recordType === 'mdoc-iaca') iacaRecords.push(record)
        else if (tags?.recordType === 'mdoc-dsc') dscRecords.push(record)
        return record
      },
    )

    vi.spyOn(Kms.PublicJwk, 'fromPublicJwk').mockReturnValue({})

    globalAgent = createMock<Agent>({
      genericRecords: { findAllByQuery: mockGlobalFindAllByQuery, save: mockGlobalSave, update: mockGlobalUpdate },
      agencyConfig: {
        mdocIssuerCountry: 'US',
        mdocIssuerAuthority: 'Heka',
        mdocDefaultDocType: 'org.iso.18013.5.1.mDL',
      },
    })
    service = new MdocIssuerCaService(globalAgent, createMock<VicalService>(), {
      appEndpoint: 'https://heka.example',
    } as never)

    agentContext = {
      contextCorrelationId: 'tenant-1',
      resolve: vi.fn((token: unknown) =>
        token === Kms.KeyManagementApi
          ? kmsApi
          : token === X509Api
            ? x509Api
            : token === GenericRecordsApi
              ? recordsApi
              : undefined,
      ),
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('provisionIaca', () => {
    beforeEach(() => {
      mockCreateKey.mockResolvedValue({ keyId: 'iaca-key', publicJwk: { kty: 'EC', crv: 'P-256' } })
    })

    test('mints a self-signed CA cert + key, persists it, and mirrors the public cert to the registry', async () => {
      const cert = buildCert()
      mockCreateCertificate.mockResolvedValue(cert)

      const iaca = await service.provisionIaca(agentContext)

      expect(mockCreateKey).toHaveBeenCalledWith({ type: { kty: 'EC', crv: 'P-256' } })

      const certOpts = mockCreateCertificate.mock.calls[0][0]
      expect(certOpts.subjectPublicKey).toBeUndefined() // self-signed
      expect(certOpts.extensions.basicConstraints).toEqual({ ca: true, pathLenConstraint: 0, markAsCritical: true })
      expect(certOpts.extensions.keyUsage).toEqual({
        usages: [X509KeyUsage.KeyCertSign, X509KeyUsage.CrlSign],
        markAsCritical: true,
      })
      expect(certOpts.issuer).toMatchObject({
        commonName: 'Heka mDL IACA',
        countryName: 'US',
        organizationalUnit: 'Heka',
      })

      expect(cert.keyId).toBe('iaca-key') // signing linkage bound onto the cert

      const tenantSave = mockSave.mock.calls[0][0]
      expect(tenantSave.tags).toMatchObject({ recordType: 'mdoc-iaca' })
      expect(tenantSave.content).toMatchObject({
        keyId: 'iaca-key',
        certificateBase64: 'CERT_B64',
        fingerprint: 'fp-abc',
        docType: 'org.iso.18013.5.1.mDL',
      })

      // mirrored to the GLOBAL registry keyed by the tenant context id
      const registrySave = mockGlobalSave.mock.calls[0][0]
      expect(registrySave.tags).toMatchObject({ recordType: 'mdoc-iaca-registry', tenantContextId: 'tenant-1' })
      expect(registrySave.content).toMatchObject({ tenantContextId: 'tenant-1', certificateBase64: 'CERT_B64' })

      expect(iaca).toMatchObject({ id: 'new-rec', keyId: 'iaca-key', commonName: 'Heka mDL IACA' })
    })

    test('honors per-tenant overrides', async () => {
      mockCreateCertificate.mockResolvedValue(buildCert())

      await service.provisionIaca(agentContext, { country: 'DE', authorityName: 'Acme', commonName: 'Acme IACA' })

      const certOpts = mockCreateCertificate.mock.calls[0][0]
      expect(certOpts.issuer).toMatchObject({ commonName: 'Acme IACA', countryName: 'DE', organizationalUnit: 'Acme' })
    })

    test.each([0, -1, 1.5, 365 * 9 + 1])('rejects validityDays %p before minting anything', async (validityDays) => {
      await expect(service.provisionIaca(agentContext, { validityDays })).rejects.toThrow(BadRequestException)
      expect(mockCreateKey).not.toHaveBeenCalled()
    })

    test('accepts the ISO 18013-5 / AAMVA maximum of 9 years', async () => {
      mockCreateCertificate.mockResolvedValue(buildCert())
      await service.provisionIaca(agentContext, { validityDays: 365 * 9 })
      const { validity } = mockCreateCertificate.mock.calls[0][0] as { validity: { notBefore: Date; notAfter: Date } }
      expect(validity.notAfter.getTime() - validity.notBefore.getTime()).toBeGreaterThan(365 * 9 * 24 * 3600 * 1000)
    })

    test('is idempotent — returns the existing IACA without minting a new one', async () => {
      iacaRecords = [{ id: 'iaca-rec', content: iacaContent() }]

      const iaca = await service.provisionIaca(agentContext)

      expect(mockCreateKey).not.toHaveBeenCalled()
      expect(mockCreateCertificate).not.toHaveBeenCalled()
      expect(iaca).toMatchObject({ id: 'iaca-rec', keyId: 'iaca-key' })
    })
  })

  describe('issueDsc', () => {
    beforeEach(() => {
      mockCreateKey.mockResolvedValue({ keyId: 'dsc-key', publicJwk: { kty: 'EC', crv: 'P-256' } })
      vi.spyOn(X509Certificate, 'fromEncodedCertificate').mockImplementation(
        () => ({ keyId: undefined, publicJwk: { marker: 'parsed-iaca' } }) as never,
      )
    })

    test('throws 400 when no IACA is provisioned (no silent mint)', async () => {
      await expect(service.issueDsc(agentContext)).rejects.toThrow(BadRequestException)
      expect(mockCreateCertificate).not.toHaveBeenCalled()
    })

    test('mints a DSC signed by the IACA with the mDL EKU, retiring the prior current DSC', async () => {
      iacaRecords = [{ id: 'iaca-rec', content: iacaContent() }]
      const prior = { id: 'dsc-old', content: { isCurrent: true }, setTag: vi.fn() }
      dscRecords = [prior]
      mockCreateCertificate.mockResolvedValue(buildCert())

      const dsc = await service.issueDsc(agentContext)

      const certOpts = mockCreateCertificate.mock.calls[0][0]
      expect(certOpts.subjectPublicKey).toBeDefined() // CA-signed (not self-signed)
      expect(certOpts.extensions.keyUsage).toEqual({ usages: [X509KeyUsage.DigitalSignature], markAsCritical: true })
      expect(certOpts.extensions.extendedKeyUsage).toEqual({
        usages: [X509ExtendedKeyUsage.MdlDs],
        markAsCritical: true,
      })
      expect(certOpts.extensions.basicConstraints).toBeUndefined() // end-entity
      expect(certOpts.extensions.authorityKeyIdentifier).toEqual({ include: true })

      // prior current DSC retained but cleared from active signing
      expect(prior.setTag).toHaveBeenCalledWith('isCurrent', 'false')
      expect(mockUpdate).toHaveBeenCalledWith(prior)

      const dscSave = mockSave.mock.calls[0][0]
      expect(dscSave.tags).toMatchObject({ recordType: 'mdoc-dsc', isCurrent: 'true' })
      expect(dscSave.content).toMatchObject({ keyId: 'dsc-key', iacaId: 'iaca-rec', isCurrent: true })
      expect(dsc).toMatchObject({ id: 'new-rec', keyId: 'dsc-key', iacaId: 'iaca-rec' })
    })
  })

  describe('loadCurrentDsc', () => {
    beforeEach(() => {
      mockCreateKey.mockResolvedValue({ keyId: 'dsc-new', publicJwk: { kty: 'EC', crv: 'P-256' } })
      vi.spyOn(X509Certificate, 'fromEncodedCertificate').mockImplementation(
        (b64: string) => ({ keyId: undefined, publicJwk: { marker: b64 } }) as never,
      )
    })

    test('throws 400 when no IACA is provisioned', async () => {
      await expect(service.loadCurrentDsc(agentContext)).rejects.toThrow(BadRequestException)
    })

    test('returns the current DSC with its keyId re-attached when still valid', async () => {
      iacaRecords = [{ id: 'iaca-rec', content: iacaContent() }]
      dscRecords = [
        {
          id: 'dsc-rec',
          content: {
            keyId: 'dsc-cur',
            certificateBase64: 'DSC_B64',
            isCurrent: true,
            notAfter: '2031-01-01T00:00:00.000Z',
          },
          setTag: vi.fn(),
        },
      ]

      const cert = await service.loadCurrentDsc(agentContext)

      expect(mockCreateCertificate).not.toHaveBeenCalled() // no reissue
      expect(cert.keyId).toBe('dsc-cur')
    })

    test('issues a DSC when none exists yet (IACA present)', async () => {
      iacaRecords = [{ id: 'iaca-rec', content: iacaContent() }]
      mockCreateCertificate.mockResolvedValue(buildCert())

      const cert = await service.loadCurrentDsc(agentContext)

      expect(mockCreateCertificate).toHaveBeenCalledTimes(1)
      expect(cert.keyId).toBe('dsc-new')
    })

    test('reissues when the current DSC is within the renewal window', async () => {
      iacaRecords = [{ id: 'iaca-rec', content: iacaContent() }]
      const soon = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString() // 5 days out (< 30d)
      dscRecords = [
        {
          id: 'dsc-rec',
          content: { keyId: 'dsc-cur', certificateBase64: 'DSC_B64', isCurrent: true, notAfter: soon },
          setTag: vi.fn(),
        },
      ]
      mockCreateCertificate.mockResolvedValue(buildCert())

      const cert = await service.loadCurrentDsc(agentContext)

      expect(mockCreateCertificate).toHaveBeenCalledTimes(1) // reissued
      expect(cert.keyId).toBe('dsc-new')
    })

    test('serializes concurrent first-issuance requests so only one DSC is minted', async () => {
      iacaRecords = [{ id: 'iaca-rec', content: iacaContent() }]
      mockCreateCertificate.mockResolvedValue(buildCert())

      await Promise.all([service.loadCurrentDsc(agentContext), service.loadCurrentDsc(agentContext)])

      expect(mockCreateKey).toHaveBeenCalledTimes(1) // single DSC key minted despite two concurrent calls
      expect(mockCreateCertificate).toHaveBeenCalledTimes(1)
    })
  })

  describe('ensure', () => {
    test('provisions the IACA and a current DSC', async () => {
      mockCreateKey
        .mockResolvedValueOnce({ keyId: 'iaca-key', publicJwk: {} }) // IACA
        .mockResolvedValueOnce({ keyId: 'dsc-key', publicJwk: {} }) // DSC
      mockCreateCertificate.mockResolvedValue(buildCert())
      vi.spyOn(X509Certificate, 'fromEncodedCertificate').mockImplementation(
        () => ({ keyId: undefined, publicJwk: { marker: 'parsed' } }) as never,
      )

      const { iaca, dsc } = await service.ensureIssuer(agentContext)

      expect(iaca).toMatchObject({ keyId: 'iaca-key' })
      expect(dsc).toMatchObject({ keyId: 'dsc-key', isCurrent: true })
    })
  })

  describe('getIaca / listDsc', () => {
    test('getIaca returns null when none provisioned', async () => {
      expect(await service.getIaca(agentContext)).toBeNull()
    })

    test('listDsc returns DSCs with the current one first', async () => {
      dscRecords = [
        { id: 'd1', content: { isCurrent: false, notAfter: '2031-01-01T00:00:00.000Z' }, setTag: vi.fn() },
        { id: 'd2', content: { isCurrent: true, notAfter: '2031-01-01T00:00:00.000Z' }, setTag: vi.fn() },
      ]

      const dscs = await service.listDsc(agentContext)

      expect(dscs.map((d) => d.id)).toEqual(['d2', 'd1'])
    })
  })

  describe('EU/EUDI profile routing', () => {
    const euCert = (b64: string, fp: string) => ({
      keyId: undefined as string | undefined,
      getThumbprintInHex: vi.fn().mockResolvedValue(fp),
      toString: vi.fn().mockReturnValue(b64),
    })

    beforeEach(() => {
      mockCreateKey.mockResolvedValue({ keyId: 'eu-iaca-key', publicJwk: { kty: 'EC', crv: 'P-256' } })
      vi.mocked(buildEuIaca).mockResolvedValue(euCert('EU_IACA_B64', 'eu-fp') as never)
      vi.mocked(buildEuDsc).mockResolvedValue(euCert('EU_DSC_B64', 'eu-dsc-fp') as never)
    })

    test('provisionIaca throws when the EU profile lacks an organizationIdentifier', async () => {
      await expect(
        service.provisionIaca(agentContext, { profile: 'eudi-pid', certificatePolicyOid: POLICY_OID }),
      ).rejects.toThrow(BadRequestException)
      expect(buildEuIaca).not.toHaveBeenCalled()
    })

    test('provisionIaca throws when the EU profile lacks a certificate-policy OID (EN 319 412-2 §4.3.3)', async () => {
      await expect(
        service.provisionIaca(agentContext, { profile: 'eudi-pid', organizationIdentifier: 'VATDE-0123456789' }),
      ).rejects.toThrow(/certificate-policy OID/)
      expect(buildEuIaca).not.toHaveBeenCalled()
    })

    test('provisionIaca routes to the EU builder (not the Credo path) and stores profile, organizationIdentifier and policy', async () => {
      await service.provisionIaca(agentContext, {
        profile: 'eudi-pid',
        organizationIdentifier: 'VATDE-0123456789',
        certificatePolicyOid: POLICY_OID,
      })

      expect(buildEuIaca).toHaveBeenCalledTimes(1)
      expect(mockCreateCertificate).not.toHaveBeenCalled() // the Credo X509Api path is not used
      expect(vi.mocked(buildEuIaca).mock.calls[0][1].dn).toMatchObject({
        organizationIdentifier: 'VATDE-0123456789',
        commonName: 'Heka PID IACA',
      })

      const tenantSave = mockSave.mock.calls[0][0]
      expect(tenantSave.content).toMatchObject({
        profile: 'eudi-pid',
        organizationIdentifier: 'VATDE-0123456789',
        certificatePolicyOid: POLICY_OID,
        certificateBase64: 'EU_IACA_B64',
      })
    })

    test('issueDsc builds a TS 119 412-6 PID sign/seal certificate: policies, QcType pid, AIA → the IACA download, no EKU', async () => {
      iacaRecords = [
        {
          id: 'iaca-rec',
          content: iacaContent({
            profile: 'eudi-pid',
            organizationIdentifier: 'VATDE-0123456789',
            certificatePolicyOid: POLICY_OID,
            fingerprint: 'eu-iaca-fp',
          }),
        },
      ]
      vi.spyOn(X509Certificate, 'fromEncodedCertificate').mockImplementation(
        () => ({ keyId: undefined, publicJwk: { marker: 'parsed-iaca' } }) as never,
      )
      mockCreateKey.mockResolvedValue({ keyId: 'eu-dsc-key', publicJwk: { kty: 'EC', crv: 'P-256' } })

      const dsc = await service.issueDsc(agentContext)

      expect(buildEuDsc).toHaveBeenCalledTimes(1)
      expect(mockCreateCertificate).not.toHaveBeenCalled()
      expect(vi.mocked(buildEuDsc).mock.calls[0][1]).toMatchObject({
        subjectDn: { organizationIdentifier: 'VATDE-0123456789', commonName: 'Heka PID DSC' },
        extendedKeyUsage: undefined,
        certificatePolicyOids: [POLICY_OID],
        qcTypes: [ID_ETSI_QCT_PID_OID],
        authorityInfoAccessCaIssuers: 'https://heka.example/mdoc-issuers/certificates/eu-iaca-fp',
      })
      expect(dsc).toMatchObject({ keyId: 'eu-dsc-key', iacaId: 'iaca-rec', isCurrent: true })
    })

    test('issueDsc under the EU mDL profile keeps the critical ISO mdlDS EKU and adds the EU bits, without a QcType', async () => {
      iacaRecords = [
        {
          id: 'iaca-rec',
          content: iacaContent({
            profile: 'mdl-eu',
            organizationIdentifier: 'VATDE-0123456789',
            certificatePolicyOid: POLICY_OID,
          }),
        },
      ]
      vi.spyOn(X509Certificate, 'fromEncodedCertificate').mockImplementation(
        () => ({ keyId: undefined, publicJwk: { marker: 'parsed-iaca' } }) as never,
      )
      mockCreateKey.mockResolvedValue({ keyId: 'eu-dsc-key', publicJwk: { kty: 'EC', crv: 'P-256' } })

      await service.issueDsc(agentContext)

      expect(vi.mocked(buildEuDsc).mock.calls[0][1]).toMatchObject({
        subjectDn: { commonName: 'Heka mDL DSC' },
        extendedKeyUsage: { oids: [MDL_DOCUMENT_SIGNER_EKU_OID], critical: true },
        certificatePolicyOids: [POLICY_OID],
        qcTypes: undefined,
      })
    })

    test('issueDsc refuses an EU IACA without a certificate-policy OID anywhere', async () => {
      iacaRecords = [
        { id: 'iaca-rec', content: iacaContent({ profile: 'eudi-pid', organizationIdentifier: 'VATDE-0123456789' }) },
      ]
      vi.spyOn(X509Certificate, 'fromEncodedCertificate').mockImplementation(
        () => ({ keyId: undefined, publicJwk: { marker: 'parsed-iaca' } }) as never,
      )
      mockCreateKey.mockResolvedValue({ keyId: 'eu-dsc-key', publicJwk: { kty: 'EC', crv: 'P-256' } })

      await expect(service.issueDsc(agentContext)).rejects.toThrow(/certificate-policy OID/)
      expect(buildEuDsc).not.toHaveBeenCalled()
    })
  })

  describe('findRegisteredIacaCertificate (the AIA caIssuers target)', () => {
    const der = Buffer.from('3003020100', 'hex') // any DER bytes — the registry stores public certs verbatim
    const fingerprint = createHash('sha256').update(der).digest('hex')

    test('serves a registered IACA by its recorded fingerprint, and by a computed one for legacy entries', async () => {
      mockGlobalFindAllByQuery.mockResolvedValue([
        { content: { certificateBase64: der.toString('base64'), fingerprint: 'recorded-fp' } },
        { content: { certificateBase64: der.toString('base64') } }, // mirrored before fingerprints were recorded
      ])

      expect(Buffer.from((await service.findRegisteredIacaCertificate('RECORDED-FP'))!)).toEqual(der)
      expect(Buffer.from((await service.findRegisteredIacaCertificate(fingerprint))!)).toEqual(der)
      expect(await service.findRegisteredIacaCertificate('unknown')).toBeNull()
    })

    test('iacaCertificateLocation is the public route under the app endpoint', () => {
      expect(service.iacaCertificateLocation('abc')).toBe('https://heka.example/mdoc-issuers/certificates/abc')
    })
  })
})
