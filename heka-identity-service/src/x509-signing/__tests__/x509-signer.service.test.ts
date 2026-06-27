import { DidJwk, Kms, X509Certificate, X509KeyUsage } from '@credo-ts/core'
import { createMock } from '@golevelup/ts-vitest'
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common'

import { Agent, TenantAgent } from 'common/agent'

import { X509SignerService } from '../x509-signer.service'

describe('X509SignerService', () => {
  let service: X509SignerService
  let tenantAgent: TenantAgent

  const mockCreateKey = vi.fn()
  const mockCreateCertificate = vi.fn()
  const mockDidsCreate = vi.fn()
  const mockSave = vi.fn()
  const mockFindById = vi.fn()
  const mockFindAllByQuery = vi.fn()
  const mockUpdate = vi.fn()
  const mockDeleteById = vi.fn()
  const mockDeleteKey = vi.fn()
  const mockGlobalFindAllByQuery = vi.fn()
  const mockGlobalSave = vi.fn()
  const mockGlobalCreateKey = vi.fn()
  const mockGlobalCreateCertificate = vi.fn()
  const mockCreateCsr = vi.fn()

  let globalAgent: Agent

  const buildCert = () => ({
    keyId: undefined as string | undefined,
    publicJwk: { marker: 'cert-public-jwk' },
    getThumbprintInHex: vi.fn().mockResolvedValue('abcd1234'),
    toString: vi.fn().mockReturnValue('BASE64_CERT'),
  })

  beforeEach(() => {
    vi.clearAllMocks()

    globalAgent = createMock<Agent>({
      genericRecords: { findAllByQuery: mockGlobalFindAllByQuery, save: mockGlobalSave },
      kms: { createKey: mockGlobalCreateKey },
      x509: { createCertificate: mockGlobalCreateCertificate },
      context: {},
    })
    service = new X509SignerService(globalAgent)

    tenantAgent = createMock<TenantAgent>({
      kms: { createKey: mockCreateKey, deleteKey: mockDeleteKey },
      x509: { createCertificate: mockCreateCertificate, createCertificateSigningRequest: mockCreateCsr },
      dids: { create: mockDidsCreate },
      genericRecords: {
        save: mockSave,
        findById: mockFindById,
        findAllByQuery: mockFindAllByQuery,
        update: mockUpdate,
        deleteById: mockDeleteById,
      },
      context: {},
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('provision', () => {
    beforeEach(() => {
      // Stub PublicJwk wrapping so we don't need a fully-valid EC JWK in the mock.
      vi.spyOn(Kms.PublicJwk, 'fromPublicJwk').mockReturnValue({})
      mockCreateKey.mockResolvedValue({ keyId: 'kms-1', publicJwk: { kty: 'EC', crv: 'P-256', kid: 'kms-1' } })
      mockDidsCreate.mockResolvedValue({ didState: { state: 'finished', did: 'did:jwk:abc' } })
      mockFindAllByQuery.mockResolvedValue([]) // no existing default
      mockSave.mockImplementation(({ content }) => ({ id: 'rec-1', content }))
    })

    test('mints a P-256 key, a self-signed DigitalSignature cert and a did:jwk, then persists it', async () => {
      const cert = buildCert()
      mockCreateCertificate.mockResolvedValue(cert)

      const identity = await service.provision(tenantAgent, { clientIdPrefix: 'x509_hash' })

      expect(mockCreateKey).toHaveBeenCalledWith({ type: { kty: 'EC', crv: 'P-256' } })

      const certOpts = mockCreateCertificate.mock.calls[0][0]
      expect(certOpts.subjectPublicKey).toBeUndefined() // self-signed
      expect(certOpts.extensions.keyUsage).toEqual({ usages: [X509KeyUsage.DigitalSignature], markAsCritical: true })
      expect(certOpts.extensions.subjectAlternativeName).toBeUndefined()

      expect(cert.keyId).toBe('kms-1') // signing linkage bound onto the cert
      expect(mockDidsCreate).toHaveBeenCalledWith({ method: 'jwk', options: { keyId: 'kms-1' } })

      const saveArg = mockSave.mock.calls[0][0]
      expect(saveArg.tags).toMatchObject({
        recordType: 'x509-signer',
        clientIdPrefix: 'x509_hash',
        isDefault: 'true',
      })
      expect(saveArg.content).toMatchObject({
        keyId: 'kms-1',
        certificateBase64: 'BASE64_CERT',
        fingerprint: 'abcd1234',
        did: 'did:jwk:abc',
        isDefault: true,
      })

      expect(identity).toMatchObject({ id: 'rec-1', clientIdPrefix: 'x509_hash', keyId: 'kms-1', did: 'did:jwk:abc' })
    })

    test('skips did creation when alsoCreateDid is false', async () => {
      mockCreateCertificate.mockResolvedValue(buildCert())

      const identity = await service.provision(tenantAgent, { alsoCreateDid: false })

      expect(mockDidsCreate).not.toHaveBeenCalled()
      expect(identity.did).toBeUndefined()
    })

    test('clears an existing default when provisioning a new default', async () => {
      const existing = { id: 'rec-old', content: { isDefault: true }, setTag: vi.fn() }
      mockFindAllByQuery.mockResolvedValue([existing])
      mockCreateCertificate.mockResolvedValue(buildCert())

      await service.provision(tenantAgent, { clientIdPrefix: 'x509_hash', makeDefault: true })

      expect(existing.setTag).toHaveBeenCalledWith('isDefault', 'false')
      expect(mockUpdate).toHaveBeenCalledWith(existing)
    })
  })

  describe('loadSigningCertificate', () => {
    test('throws when no matching identity exists', async () => {
      mockFindAllByQuery.mockResolvedValue([])

      await expect(service.loadSigningCertificate(tenantAgent, { clientIdPrefix: 'x509_hash' })).rejects.toThrow(
        UnprocessableEntityException,
      )
    })

    test('loads the default identity and re-attaches the keyId', async () => {
      const parsed = { keyId: undefined as string | undefined }
      const spy = vi.spyOn(X509Certificate, 'fromEncodedCertificate').mockReturnValue(parsed as never)
      mockFindAllByQuery.mockResolvedValue([{ id: 'rec-1', content: { certificateBase64: 'B64', keyId: 'kms-1' } }])

      const cert = await service.loadSigningCertificate(tenantAgent, { clientIdPrefix: 'x509_hash' })

      expect(spy).toHaveBeenCalledWith('B64')
      expect(cert.keyId).toBe('kms-1')
    })

    test('loads a specific identity by certificateId', async () => {
      const parsed = { keyId: undefined as string | undefined }
      const spy = vi.spyOn(X509Certificate, 'fromEncodedCertificate').mockReturnValue(parsed as never)
      mockFindById.mockResolvedValue({ id: 'rec-9', content: { certificateBase64: 'B9', keyId: 'kms-9' } })

      const cert = await service.loadSigningCertificate(tenantAgent, {
        clientIdPrefix: 'x509_hash',
        certificateId: 'rec-9',
      })

      expect(mockFindById).toHaveBeenCalledWith('rec-9')
      expect(spy).toHaveBeenCalledWith('B9')
      expect(cert.keyId).toBe('kms-9')
    })
  })

  describe('didFromCertificate', () => {
    test('derives a did:jwk from the certificate public key', () => {
      const spy = vi.spyOn(DidJwk, 'fromPublicJwk').mockReturnValue({ did: 'did:jwk:xyz' } as never)
      const certificate = { publicJwk: { marker: true } } as never

      expect(service.didFromCertificate(certificate)).toBe('did:jwk:xyz')
      expect(spy).toHaveBeenCalledWith({ marker: true })
    })
  })

  describe('provision (x509_san_dns — CA-issued)', () => {
    beforeEach(() => {
      vi.spyOn(Kms.PublicJwk, 'fromPublicJwk').mockReturnValue({})
      mockCreateKey.mockResolvedValue({
        keyId: 'tenant-key',
        publicJwk: { kty: 'EC', crv: 'P-256', kid: 'tenant-key' },
      })
      mockDidsCreate.mockResolvedValue({ didState: { state: 'finished', did: 'did:jwk:leaf' } })
      mockFindAllByQuery.mockResolvedValue([]) // tenant default lookup
      mockSave.mockImplementation(({ content }) => ({ id: 'rec-1', content }))
      // global agent: no existing root → create one, then issue the leaf
      mockGlobalFindAllByQuery.mockResolvedValue([])
      mockGlobalCreateKey.mockResolvedValue({
        keyId: 'root-key',
        publicJwk: { kty: 'EC', crv: 'P-256', kid: 'root-key' },
      })
      mockGlobalCreateCertificate.mockResolvedValueOnce(buildCert()).mockResolvedValueOnce(buildCert())
      mockGlobalSave.mockResolvedValue({ id: 'root-rec' })
    })

    test('issues a CA-signed leaf under the service root (signed on the global agent, not self-signed)', async () => {
      const identity = await service.provision(tenantAgent, {
        clientIdPrefix: 'x509_san_dns',
        sanDnsName: 'verifier.example.com',
      })

      // The leaf is NOT self-signed via the tenant agent.
      expect(mockCreateCertificate).not.toHaveBeenCalled()
      // Root CA + leaf are both created on the global agent.
      expect(mockGlobalCreateCertificate).toHaveBeenCalledTimes(2)
      const leafOpts = mockGlobalCreateCertificate.mock.calls[1][0]
      expect(leafOpts.subjectPublicKey).toBeDefined()
      expect(leafOpts.extensions.subjectAlternativeName).toEqual({
        name: [{ type: 'dns', value: 'verifier.example.com' }],
      })
      expect(leafOpts.extensions.keyUsage).toEqual({ usages: [X509KeyUsage.DigitalSignature], markAsCritical: true })
      // Persisted as an x509_san_dns identity bound to the tenant key.
      expect(mockSave.mock.calls[0][0].content).toMatchObject({
        clientIdPrefix: 'x509_san_dns',
        keyId: 'tenant-key',
        sanDnsName: 'verifier.example.com',
      })
      expect(identity.clientIdPrefix).toBe('x509_san_dns')
    })

    test('reuses an existing root CA instead of creating a second one', async () => {
      mockGlobalFindAllByQuery.mockResolvedValue([{ content: { keyId: 'root-key', certificateBase64: 'ROOTB64' } }])
      const fromEncoded = vi.spyOn(X509Certificate, 'fromEncodedCertificate').mockReturnValue(buildCert() as never)
      mockGlobalCreateCertificate.mockReset().mockResolvedValueOnce(buildCert()) // only the leaf

      await service.provision(tenantAgent, { clientIdPrefix: 'x509_san_dns', sanDnsName: 'verifier.example.com' })

      expect(mockGlobalCreateKey).not.toHaveBeenCalled() // no new root key
      expect(fromEncoded).toHaveBeenCalledWith('ROOTB64')
      expect(mockGlobalCreateCertificate).toHaveBeenCalledTimes(1) // leaf only
    })

    test('throws when sanDnsName is missing', async () => {
      await expect(service.provision(tenantAgent, { clientIdPrefix: 'x509_san_dns' })).rejects.toThrow(
        UnprocessableEntityException,
      )
    })
  })

  describe('getServiceRootCertificate', () => {
    test('returns the root certificate + fingerprint when provisioned', async () => {
      const parsed = { getThumbprintInHex: vi.fn().mockResolvedValue('rootfp') }
      vi.spyOn(X509Certificate, 'fromEncodedCertificate').mockReturnValue(parsed as never)
      mockGlobalFindAllByQuery.mockResolvedValue([{ content: { certificateBase64: 'ROOTB64', keyId: 'root-key' } }])

      expect(await service.getServiceRootCertificate()).toEqual({ certificateBase64: 'ROOTB64', fingerprint: 'rootfp' })
    })

    test('returns null when no root CA exists', async () => {
      mockGlobalFindAllByQuery.mockResolvedValue([])
      expect(await service.getServiceRootCertificate()).toBeNull()
    })
  })

  describe('createSigningCsr', () => {
    test('creates a tenant key and returns a CSR PEM + keyId', async () => {
      vi.spyOn(Kms.PublicJwk, 'fromPublicJwk').mockReturnValue({})
      mockCreateKey.mockResolvedValue({ keyId: 'csr-key', publicJwk: {} })
      const csrObj = { toString: vi.fn().mockReturnValue('-----BEGIN CERTIFICATE REQUEST-----') }
      mockCreateCsr.mockResolvedValue(csrObj)

      const result = await service.createSigningCsr(tenantAgent, { sanDnsName: 'verifier.example.com' })

      expect(result.keyId).toBe('csr-key')
      expect(result.csrPem).toContain('CERTIFICATE REQUEST')
      const csrOpts = mockCreateCsr.mock.calls[0][0]
      expect(csrOpts.extensions.subjectAlternativeName).toEqual({
        name: [{ type: 'dns', value: 'verifier.example.com' }],
      })
    })
  })

  describe('importSignedCertificate', () => {
    test('binds the keyId to the signed leaf and persists it as an x509_san_dns identity', async () => {
      const leaf = {
        keyId: undefined as string | undefined,
        sanDnsNames: ['verifier.example.com'],
        data: { notAfter: new Date('2030-01-01T00:00:00Z') },
        getThumbprintInHex: vi.fn().mockResolvedValue('leaffp'),
        toString: vi.fn().mockReturnValue('LEAFB64'),
      }
      vi.spyOn(X509Certificate, 'fromEncodedCertificate').mockReturnValue(leaf as never)
      mockFindAllByQuery.mockResolvedValue([]) // no existing default
      mockSave.mockImplementation(({ content }) => ({ id: 'imp-1', content }))

      const identity = await service.importSignedCertificate(tenantAgent, {
        keyId: 'csr-key',
        certificate: '-----BEGIN CERTIFICATE-----',
      })

      expect(leaf.keyId).toBe('csr-key')
      expect(identity).toMatchObject({
        id: 'imp-1',
        clientIdPrefix: 'x509_san_dns',
        keyId: 'csr-key',
        sanDnsName: 'verifier.example.com',
      })
      expect(mockSave.mock.calls[0][0].content.certificateBase64).toBe('LEAFB64')
    })
  })

  describe('get', () => {
    test('returns the identity when present', async () => {
      mockFindById.mockResolvedValue({
        id: 'rec-1',
        content: { purpose: 'request-signing', clientIdPrefix: 'x509_hash', keyId: 'kms-1' },
      })

      const identity = await service.get(tenantAgent, 'rec-1')

      expect(identity).toMatchObject({ id: 'rec-1', clientIdPrefix: 'x509_hash', keyId: 'kms-1' })
    })

    test('throws NotFound when the id is unknown', async () => {
      mockFindById.mockResolvedValue(null)
      await expect(service.get(tenantAgent, 'missing')).rejects.toThrow(NotFoundException)
    })

    test('throws NotFound for a record that is not a signer', async () => {
      mockFindById.mockResolvedValue({ id: 'x', content: { purpose: 'something-else' } })
      await expect(service.get(tenantAgent, 'x')).rejects.toThrow(NotFoundException)
    })
  })

  describe('setDefault', () => {
    test('clears the previous default and marks this identity as default', async () => {
      const target = {
        id: 'rec-2',
        content: { purpose: 'request-signing', clientIdPrefix: 'x509_hash', keyId: 'kms-2', isDefault: false },
        setTag: vi.fn(),
      }
      const prior = { id: 'rec-1', content: { isDefault: true }, setTag: vi.fn() }
      mockFindById.mockResolvedValue(target)
      mockFindAllByQuery.mockResolvedValue([prior]) // clearDefault lookup

      const result = await service.setDefault(tenantAgent, 'rec-2')

      expect(prior.setTag).toHaveBeenCalledWith('isDefault', 'false')
      expect(target.setTag).toHaveBeenCalledWith('isDefault', 'true')
      expect(mockUpdate).toHaveBeenCalledWith(target)
      expect(result).toMatchObject({ id: 'rec-2', isDefault: true })
    })

    test('throws NotFound when the id is unknown', async () => {
      mockFindById.mockResolvedValue(null)
      await expect(service.setDefault(tenantAgent, 'missing')).rejects.toThrow(NotFoundException)
    })
  })

  describe('rotate', () => {
    beforeEach(() => {
      vi.spyOn(Kms.PublicJwk, 'fromPublicJwk').mockReturnValue({})
      mockCreateKey.mockResolvedValue({ keyId: 'new-key', publicJwk: { kty: 'EC', crv: 'P-256', kid: 'new-key' } })
      mockDidsCreate.mockResolvedValue({ didState: { state: 'finished', did: 'did:jwk:new' } })
      mockCreateCertificate.mockResolvedValue(buildCert())
      mockFindAllByQuery.mockResolvedValue([]) // no existing default during reprovision
      mockSave.mockImplementation(({ content }) => ({ id: 'rec-new', content }))
    })

    test('reissues a fresh key + cert, carries the default flag, and retires the old record + key', async () => {
      mockFindById.mockResolvedValue({
        id: 'rec-old',
        content: {
          purpose: 'request-signing',
          clientIdPrefix: 'x509_hash',
          keyId: 'old-key',
          did: 'did:jwk:old',
          commonName: 'Acme Verifier',
          isDefault: true,
        },
      })

      const identity = await service.rotate(tenantAgent, 'rec-old', {})

      expect(mockCreateKey).toHaveBeenCalledWith({ type: { kty: 'EC', crv: 'P-256' } }) // fresh key minted
      expect(mockDidsCreate).toHaveBeenCalled() // did re-projected (original had one)
      expect(mockSave.mock.calls[0][0].content).toMatchObject({ clientIdPrefix: 'x509_hash', isDefault: true })
      expect(mockDeleteById).toHaveBeenCalledWith('rec-old') // old record retired
      expect(mockDeleteKey).toHaveBeenCalledWith({ keyId: 'old-key' }) // old key removed
      expect(identity).toMatchObject({ id: 'rec-new', clientIdPrefix: 'x509_hash', keyId: 'new-key' })
    })

    test('skips did re-projection when the original had none', async () => {
      mockFindById.mockResolvedValue({
        id: 'rec-old',
        content: { purpose: 'request-signing', clientIdPrefix: 'x509_hash', keyId: 'old-key', isDefault: false },
      })

      await service.rotate(tenantAgent, 'rec-old', {})

      expect(mockDidsCreate).not.toHaveBeenCalled()
      expect(mockDeleteById).toHaveBeenCalledWith('rec-old')
    })

    test('throws NotFound when the identity is absent', async () => {
      mockFindById.mockResolvedValue(null)
      await expect(service.rotate(tenantAgent, 'missing', {})).rejects.toThrow(NotFoundException)
    })
  })

  describe('delete', () => {
    test('removes the record and best-effort deletes the KMS key', async () => {
      mockFindById.mockResolvedValue({ id: 'rec-1', content: { purpose: 'request-signing', keyId: 'kms-1' } })
      mockDeleteKey.mockResolvedValue(true)

      await service.delete(tenantAgent, 'rec-1')

      expect(mockDeleteById).toHaveBeenCalledWith('rec-1')
      expect(mockDeleteKey).toHaveBeenCalledWith({ keyId: 'kms-1' })
    })

    test('still resolves when KMS key deletion fails (best-effort)', async () => {
      mockFindById.mockResolvedValue({ id: 'rec-1', content: { purpose: 'request-signing', keyId: 'kms-1' } })
      mockDeleteKey.mockRejectedValue(new Error('key gone'))

      await expect(service.delete(tenantAgent, 'rec-1')).resolves.toBeUndefined()
      expect(mockDeleteById).toHaveBeenCalledWith('rec-1')
    })

    test('throws NotFound when the identity is absent', async () => {
      mockFindById.mockResolvedValue(null)
      await expect(service.delete(tenantAgent, 'missing')).rejects.toThrow(NotFoundException)
    })
  })
})
