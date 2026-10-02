import type { AgentContext, X509Certificate } from '@credo-ts/core'

import { BadRequestException, Inject, Injectable } from '@nestjs/common'

import { Agent, AGENT_TOKEN } from 'common/agent'
import { ManagedCertificateService } from 'x509-signing'

import { SDJWT_ISSUER_REGISTRY_RECORD_TYPE, SdJwtIssuerRegistryEntry } from './sdjwt-issuer-registry'

const RECORD_TYPE = 'sdjwt-vc-issuer'

const NOT_CONFIGURED_MESSAGE =
  'SD-JWT VC x5c issuance requires SD_JWT_VC_ISSUER_DOMAIN to be configured (the dNSName SAN + iss host). ' +
  'Set it, or omit issuerMode:x5c to issue DID-based SD-JWT VCs.'

/**
 * Provisions and loads the per-tenant **SD-JWT VC x5c issuer** certificate (HAIP, opt-in).
 * The cert is a leaf signed by the service root CA
 * (so the wallet trusts the same root it uses for the VICAL), carrying the configured issuer **domain**
 * as a dNSName SAN; the credential `iss` is `https://<domain>`, whose host must match that SAN.
 *
 * This is a **distinct trust domain** from the mdoc IACA/DSC chain and from the verifier request-signing
 * leaves: a plain DigitalSignature leaf, **no** MdlDs EKU.
 *
 * Key/cert lifecycle (provision, 30-day renewal, locking) is delegated to {@link ManagedCertificateService};
 * the record is keyed by the configured domain, so a domain change mints a fresh issuer identity.
 */
@Injectable()
export class SdJwtVcIssuerService {
  public constructor(
    @Inject(AGENT_TOKEN) private readonly agent: Agent,
    private readonly managedCertificateService: ManagedCertificateService,
  ) {}

  /**
   * The x5c chain ([issuer-leaf, service-root]) and the `iss` URL for signing an SD-JWT VC with the
   * tenant's issuer cert. Lazily provisions/reissues the cert. Throws a 400 when no issuer domain is
   * configured.
   */
  public async loadIssuerCertificateChain(
    agentContext: AgentContext,
  ): Promise<{ certificateChain: X509Certificate[]; issuerUrl: string }> {
    const domain = this.agent.agencyConfig.sdJwtVcIssuerDomain
    if (!domain) {
      throw new BadRequestException(NOT_CONFIGURED_MESSAGE)
    }
    const { chain } = await this.managedCertificateService.ensureCertificate(agentContext, {
      recordType: RECORD_TYPE,
      tags: { domain },
      commonName: domain,
      sanDnsName: domain, // HAIP: iss host (https://<domain>) must match this dNSName SAN
    })
    await this.mirrorToRegistry(agentContext, domain, chain[0])
    return { certificateChain: chain, issuerUrl: `https://${domain}` }
  }

  /**
   * Mirror the tenant's public issuer leaf to the global SD-JWT issuer registry (keyed by context id),
   * so the scheme trust list can enumerate per-tenant issuer identities across isolated tenant stores.
   * Keys never leave the tenant store — only the public certificate is copied; unchanged certificates
   * are not rewritten.
   */
  private async mirrorToRegistry(agentContext: AgentContext, domain: string, leaf: X509Certificate): Promise<void> {
    const tenantContextId = agentContext.contextCorrelationId
    const content: SdJwtIssuerRegistryEntry = {
      tenantContextId,
      domain,
      certificateBase64: leaf.toString('base64'),
      notAfter: leaf.data.notAfter.toISOString(),
    }
    const existing = (
      await this.agent.genericRecords.findAllByQuery({ recordType: SDJWT_ISSUER_REGISTRY_RECORD_TYPE, tenantContextId })
    )[0]
    if (existing) {
      const current = existing.content as unknown as SdJwtIssuerRegistryEntry
      if (current.certificateBase64 === content.certificateBase64 && current.domain === domain) return
      existing.content = { ...content }
      await this.agent.genericRecords.update(existing)
    } else {
      await this.agent.genericRecords.save({
        content: { ...content },
        tags: { recordType: SDJWT_ISSUER_REGISTRY_RECORD_TYPE, tenantContextId },
      })
    }
  }
}
