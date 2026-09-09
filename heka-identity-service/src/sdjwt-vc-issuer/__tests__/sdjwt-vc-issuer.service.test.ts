import { createMock } from '@golevelup/ts-vitest'
import { BadRequestException } from '@nestjs/common'

import { Agent } from 'common/agent'
import { ManagedCertificate, ManagedCertificateService } from 'x509-signing'

import { SdJwtVcIssuerService } from '../sdjwt-vc-issuer.service'

describe('SdJwtVcIssuerService', () => {
  let managedCertificateService: ManagedCertificateService
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agentContext: any = { contextCorrelationId: 'tenant-1' }

  const leaf = { keyId: 'sdjwt-key' }
  const root = {}
  const managed = { keyId: 'sdjwt-key', certificate: leaf, root, chain: [leaf, root], record: { id: 'rec-1' } }

  const buildService = (agencyConfig: Record<string, unknown>) => {
    const agent = createMock<Agent>({ agencyConfig })
    return new SdJwtVcIssuerService(agent, managedCertificateService)
  }

  beforeEach(() => {
    vi.clearAllMocks()
    managedCertificateService = createMock<ManagedCertificateService>()
    vi.mocked(managedCertificateService.ensureCertificate).mockResolvedValue(managed as unknown as ManagedCertificate)
  })

  test('throws 400 (and mints nothing) when no issuer domain is configured', async () => {
    const service = buildService({ sdJwtVcIssuerDomain: '' })
    await expect(service.loadIssuerCertificateChain(agentContext)).rejects.toThrow(BadRequestException)
    expect(managedCertificateService.ensureCertificate).not.toHaveBeenCalled()
  })

  test('requests a domain-keyed leaf (CN + SAN = domain) and returns the chain + iss URL', async () => {
    const service = buildService({ sdJwtVcIssuerDomain: 'issuer.heka.example' })

    const result = await service.loadIssuerCertificateChain(agentContext)

    expect(managedCertificateService.ensureCertificate).toHaveBeenCalledWith(agentContext, {
      recordType: 'sdjwt-vc-issuer',
      tags: { domain: 'issuer.heka.example' }, // domain-keyed: a domain change mints a fresh identity
      commonName: 'issuer.heka.example',
      sanDnsName: 'issuer.heka.example',
    })
    expect(result.issuerUrl).toBe('https://issuer.heka.example')
    expect(result.certificateChain).toHaveLength(2) // [leaf, service-root]
    expect(result.certificateChain[0].keyId).toBe('sdjwt-key')
  })
})
