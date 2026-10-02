import { createMock } from '@golevelup/ts-vitest'

import { Agent } from 'common/agent'
import { ManagedCertificate, ManagedCertificateService } from 'x509-signing'

import { AccessCertificateService } from '../access-certificate.service'

describe('AccessCertificateService', () => {
  let managedCertificateService: ManagedCertificateService
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agentContext: any = { contextCorrelationId: 'tenant-1' }

  const leaf = { keyId: 'access-key' }
  const root = {}
  const managed = { keyId: 'access-key', certificate: leaf, root, chain: [leaf, root], record: { id: 'rec-1' } }

  const buildService = (agencyConfig: Record<string, unknown>) => {
    const agent = createMock<Agent>({ agencyConfig })
    return new AccessCertificateService(agent, managedCertificateService)
  }

  beforeEach(() => {
    vi.clearAllMocks()
    managedCertificateService = createMock<ManagedCertificateService>()
    vi.mocked(managedCertificateService.ensureCertificate).mockResolvedValue(managed as unknown as ManagedCertificate)
  })

  test('returns undefined (and mints nothing) when signed-metadata publishing is disabled', async () => {
    const service = buildService({ oid4vciSignedMetadataEnabled: false })
    await expect(service.loadAccessCertificateChain(agentContext)).resolves.toBeUndefined()
    expect(managedCertificateService.ensureCertificate).not.toHaveBeenCalled()
  })

  test('requests a service-root-signed leaf (default CN, no SAN) and returns the [leaf, root] chain', async () => {
    const service = buildService({ oid4vciSignedMetadataEnabled: true, oid4vciAccessCertificateDomain: '' })

    const chain = await service.loadAccessCertificateChain(agentContext)

    expect(managedCertificateService.ensureCertificate).toHaveBeenCalledWith(agentContext, {
      recordType: 'oid4vci-access-cert',
      commonName: 'Heka OID4VCI Access Certificate',
      sanDnsName: undefined,
    })
    expect(chain).toHaveLength(2) // [leaf, service-root]
    expect(chain?.[0].keyId).toBe('access-key') // KMS key bound onto the leaf for Credo signing
  })

  test('uses the configured domain as CN + dNSName SAN (HAIP iss-host binding)', async () => {
    const service = buildService({
      oid4vciSignedMetadataEnabled: true,
      oid4vciAccessCertificateDomain: 'issuer.heka.example',
    })

    await service.loadAccessCertificateChain(agentContext)

    expect(managedCertificateService.ensureCertificate).toHaveBeenCalledWith(
      agentContext,
      expect.objectContaining({ commonName: 'issuer.heka.example', sanDnsName: 'issuer.heka.example' }),
    )
  })
})
