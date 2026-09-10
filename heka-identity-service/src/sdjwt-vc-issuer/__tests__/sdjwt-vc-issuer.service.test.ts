import { createMock } from '@golevelup/ts-vitest'
import { BadRequestException } from '@nestjs/common'

import { Agent } from 'common/agent'
import { ManagedCertificate, ManagedCertificateService } from 'x509-signing'

import { SDJWT_ISSUER_REGISTRY_RECORD_TYPE } from '../sdjwt-issuer-registry'
import { SdJwtVcIssuerService } from '../sdjwt-vc-issuer.service'

describe('SdJwtVcIssuerService', () => {
  let managedCertificateService: ManagedCertificateService
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agentContext: any = { contextCorrelationId: 'tenant-1' }

  const leaf = { keyId: 'sdjwt-key', toString: () => 'LEAF-B64', data: { notAfter: new Date('2031-01-01T00:00:00Z') } }
  const root = {}
  const managed = { keyId: 'sdjwt-key', certificate: leaf, root, chain: [leaf, root], record: { id: 'rec-1' } }

  const buildService = (
    agencyConfig: Record<string, unknown>,
    mirrored: { certificateBase64: string; domain: string }[] = [],
  ) => {
    const genericRecords = {
      findAllByQuery: vi.fn().mockResolvedValue(mirrored.map((content) => ({ content }))),
      save: vi.fn(),
      update: vi.fn(),
    }
    const agent = createMock<Agent>({ agencyConfig, genericRecords } as unknown as Partial<Agent>)
    return { service: new SdJwtVcIssuerService(agent, managedCertificateService), genericRecords }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    managedCertificateService = createMock<ManagedCertificateService>()
    vi.mocked(managedCertificateService.ensureCertificate).mockResolvedValue(managed as unknown as ManagedCertificate)
  })

  test('throws 400 (and mints nothing) when no issuer domain is configured', async () => {
    const { service } = buildService({ sdJwtVcIssuerDomain: '' })
    await expect(service.loadIssuerCertificateChain(agentContext)).rejects.toThrow(BadRequestException)
    expect(managedCertificateService.ensureCertificate).not.toHaveBeenCalled()
  })

  test('requests a domain-keyed leaf (CN + SAN = domain) and returns the chain + iss URL', async () => {
    const { service, genericRecords } = buildService({ sdJwtVcIssuerDomain: 'issuer.heka.example' })

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
    // The public leaf is mirrored into the global SD-JWT issuer registry for the scheme trust list.
    expect(genericRecords.save).toHaveBeenCalledWith({
      content: {
        tenantContextId: 'tenant-1',
        domain: 'issuer.heka.example',
        certificateBase64: 'LEAF-B64',
        notAfter: '2031-01-01T00:00:00.000Z',
      },
      tags: { recordType: SDJWT_ISSUER_REGISTRY_RECORD_TYPE, tenantContextId: 'tenant-1' },
    })
  })

  test('does not rewrite the registry mirror when the mirrored certificate is unchanged', async () => {
    const { service, genericRecords } = buildService({ sdJwtVcIssuerDomain: 'issuer.heka.example' }, [
      { certificateBase64: 'LEAF-B64', domain: 'issuer.heka.example' },
    ])
    await service.loadIssuerCertificateChain(agentContext)
    expect(genericRecords.save).not.toHaveBeenCalled()
    expect(genericRecords.update).not.toHaveBeenCalled()
  })
})
