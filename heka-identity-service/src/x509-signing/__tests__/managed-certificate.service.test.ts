import { GenericRecordsApi, Kms, X509Certificate } from '@credo-ts/core'
import { createMock } from '@golevelup/ts-vitest'

import { Logger } from 'common/logger'

import { ManagedCertificateService } from '../managed-certificate.service'
import { X509SignerService } from '../x509-signer.service'

describe('ManagedCertificateService', () => {
  let service: ManagedCertificateService
  let x509SignerService: X509SignerService
  let logger: Logger
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let agentContext: any

  const mockCreateKey = vi.fn()
  const mockFindAllByQuery = vi.fn()
  const mockSave = vi.fn()
  const mockUpdate = vi.fn()
  const mockDeleteById = vi.fn()
  let records: Array<{ id: string; content: Record<string, unknown> }>

  const FUTURE = '2031-01-01T00:00:00Z' // far outside the renew window
  const SOON = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString() // inside the 30-day window

  const buildCert = () => ({
    keyId: undefined as string | undefined,
    publicJwk: { marker: 'pub' },
    data: { notAfter: new Date(FUTURE) },
    toString: vi.fn().mockReturnValue('LEAF_B64'),
  })

  const profile = { recordType: 'test-managed-cert', commonName: 'Test Managed Cert' }

  beforeEach(() => {
    vi.clearAllMocks()
    records = []
    mockCreateKey.mockResolvedValue({ keyId: 'fresh-key', publicJwk: { kty: 'EC', crv: 'P-256' } })
    mockFindAllByQuery.mockImplementation(() => Promise.resolve(records))
    mockSave.mockImplementation(({ content }) => {
      const record = { id: `rec-${records.length + 1}`, content }
      records.push(record)
      return record
    })
    mockUpdate.mockResolvedValue(undefined)
    mockDeleteById.mockResolvedValue(undefined)
    vi.spyOn(Kms.PublicJwk, 'fromPublicJwk').mockReturnValue({})
    vi.spyOn(X509Certificate, 'fromEncodedCertificate').mockImplementation(() => buildCert() as never)

    x509SignerService = createMock<X509SignerService>()
    vi.mocked(x509SignerService.issueServiceRootSignedCertificate).mockResolvedValue({
      certificate: buildCert() as never,
      rootCertificateBase64: 'ROOT_B64',
    })
    logger = createMock<Logger>()
    service = new ManagedCertificateService(x509SignerService, logger)

    agentContext = {
      contextCorrelationId: 'tenant-1',
      resolve: vi.fn((token: unknown) =>
        token === Kms.KeyManagementApi
          ? { createKey: mockCreateKey }
          : token === GenericRecordsApi
            ? { findAllByQuery: mockFindAllByQuery, save: mockSave, update: mockUpdate, deleteById: mockDeleteById }
            : undefined,
      ),
    }
  })

  afterEach(() => vi.restoreAllMocks())

  test('provisions on an empty store: key + service-root-signed leaf, one record, keyId bound', async () => {
    const result = await service.ensureCertificate(agentContext, { ...profile, sanDnsName: 'issuer.example' })

    expect(mockCreateKey).toHaveBeenCalledWith({ type: { kty: 'EC', crv: 'P-256' } })
    expect(x509SignerService.issueServiceRootSignedCertificate).toHaveBeenCalledWith(
      expect.objectContaining({ commonName: 'Test Managed Cert', sanDnsName: 'issuer.example' }),
    )
    expect(mockSave).toHaveBeenCalledTimes(1)
    expect(mockSave.mock.calls[0][0].tags).toEqual({ recordType: 'test-managed-cert' })
    expect(mockSave.mock.calls[0][0].content).toMatchObject({ keyId: 'fresh-key', certificateBase64: 'LEAF_B64' })
    expect(result.chain).toHaveLength(2) // [leaf, root]
    expect(result.certificate.keyId).toBe('fresh-key')
    expect(result.keyId).toBe('fresh-key')
  })

  test('reuses a valid existing record without minting', async () => {
    records = [
      {
        id: 'rec-1',
        content: {
          keyId: 'existing-key',
          certificateBase64: 'EXISTING_B64',
          rootCertificateBase64: 'ROOT_B64',
          notAfter: FUTURE,
        },
      },
    ]

    const result = await service.ensureCertificate(agentContext, profile)

    expect(mockCreateKey).not.toHaveBeenCalled()
    expect(x509SignerService.issueServiceRootSignedCertificate).not.toHaveBeenCalled()
    expect(result.keyId).toBe('existing-key')
    expect(result.record.id).toBe('rec-1')
  })

  test('renews inside the renew window IN PLACE: key rotated, record updated (never a second save), extras preserved', async () => {
    const existing = {
      id: 'rec-1',
      content: {
        keyId: 'old-key',
        certificateBase64: 'OLD_B64',
        rootCertificateBase64: 'ROOT_B64',
        notAfter: SOON,
        issueID: 7, // caller-owned extra field (VICAL counter pattern)
      },
    }
    records = [existing]

    const result = await service.ensureCertificate(agentContext, profile)

    expect(mockCreateKey).toHaveBeenCalledTimes(1)
    expect(mockSave).not.toHaveBeenCalled() // single-record invariant
    expect(mockUpdate).toHaveBeenCalledTimes(1)
    expect(existing.content).toMatchObject({ keyId: 'fresh-key', certificateBase64: 'LEAF_B64', issueID: 7 })
    expect(result.keyId).toBe('fresh-key')
    expect(result.record.id).toBe('rec-1')
  })

  test('an expired record is renewed too', async () => {
    records = [
      {
        id: 'rec-1',
        content: {
          keyId: 'old-key',
          certificateBase64: 'OLD_B64',
          rootCertificateBase64: 'R',
          notAfter: '2020-01-01T00:00:00Z',
        },
      },
    ]

    const result = await service.ensureCertificate(agentContext, profile)

    expect(mockUpdate).toHaveBeenCalledTimes(1)
    expect(result.keyId).toBe('fresh-key')
  })

  test('self-heals duplicate records: keeps the newest notAfter, deletes the stale, logs a warning', async () => {
    records = [
      {
        id: 'rec-old',
        content: { keyId: 'k1', certificateBase64: 'A', rootCertificateBase64: 'R', notAfter: '2030-01-01T00:00:00Z' },
      },
      { id: 'rec-new', content: { keyId: 'k2', certificateBase64: 'B', rootCertificateBase64: 'R', notAfter: FUTURE } },
    ]

    const result = await service.ensureCertificate(agentContext, profile)

    expect(result.record.id).toBe('rec-new')
    expect(result.keyId).toBe('k2')
    expect(mockDeleteById).toHaveBeenCalledTimes(1)
    expect(mockDeleteById).toHaveBeenCalledWith('rec-old')
    expect(logger.warn).toHaveBeenCalledTimes(1)
  })

  test('tags discriminate identities: they extend the record query and the saved tags', async () => {
    await service.ensureCertificate(agentContext, { ...profile, tags: { domain: 'a.example' } })

    expect(mockFindAllByQuery).toHaveBeenCalledWith({ recordType: 'test-managed-cert', domain: 'a.example' })
    expect(mockSave.mock.calls[0][0].tags).toEqual({ recordType: 'test-managed-cert', domain: 'a.example' })
    expect(mockSave.mock.calls[0][0].content).toMatchObject({ domain: 'a.example' })
  })

  test('concurrent ensure calls single-flight (one mint, same result)', async () => {
    const [first, second] = await Promise.all([
      service.ensureCertificate(agentContext, profile),
      service.ensureCertificate(agentContext, profile),
    ])

    expect(mockCreateKey).toHaveBeenCalledTimes(1)
    expect(mockSave).toHaveBeenCalledTimes(1)
    expect(first).toBe(second)
  })
})
