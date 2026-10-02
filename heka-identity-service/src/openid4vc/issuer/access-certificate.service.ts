import type { AgentContext, X509Certificate } from '@credo-ts/core'

import { Inject, Injectable } from '@nestjs/common'

import { Agent, AGENT_TOKEN } from 'common/agent'
import { ManagedCertificateService } from 'x509-signing'

const RECORD_TYPE = 'oid4vci-access-cert'
const DEFAULT_COMMON_NAME = 'Heka OID4VCI Access Certificate'

/**
 * Provisions and loads the **OID4VCI issuer access certificate** used to sign the `signed_metadata` JWT
 * published in the credential-issuer metadata (so the wallet can authenticate the issuer at issuance).
 *
 * This is a **distinct trust identity**: its own P-256 key + Askar record + lifecycle — deliberately
 * NOT the mdoc IACA/DSC signing chain, nor the SD-JWT VC issuer cert. OFF unless `OID4VCI_SIGNED_METADATA_ENABLED` — `loadAccessCertificateChain` then
 * returns `undefined`, and issuance is unaffected.
 *
 * STAND-IN anchor: the leaf is signed by the Heka **service root** as a placeholder for a real
 * Member-State **Access CA** anchor. The `signed_metadata` *shape* is exercised end-to-end, but the trust
 * is not real until that anchor is issued and listed on an EU trusted list.
 *
 * Key/cert lifecycle (provision, 30-day renewal, locking) is delegated to {@link ManagedCertificateService}.
 */
@Injectable()
export class AccessCertificateService {
  public constructor(
    @Inject(AGENT_TOKEN) private readonly agent: Agent,
    private readonly managedCertificateService: ManagedCertificateService,
  ) {}

  /**
   * The x5c chain (`[access-leaf, service-root]`) for the OID4VCI metadata signer, with the leaf's KMS
   * `keyId` bound so Credo signs the `signed_metadata` JWT with it — or `undefined` when signed-metadata
   * publishing is disabled. Lazily provisions/reissues the access certificate.
   */
  public async loadAccessCertificateChain(agentContext: AgentContext): Promise<X509Certificate[] | undefined> {
    if (!this.agent.agencyConfig.oid4vciSignedMetadataEnabled) {
      return undefined
    }
    const domain = this.agent.agencyConfig.oid4vciAccessCertificateDomain
    const { chain } = await this.managedCertificateService.ensureCertificate(agentContext, {
      recordType: RECORD_TYPE,
      commonName: domain || DEFAULT_COMMON_NAME,
      sanDnsName: domain || undefined, // HAIP-style iss-host binding when a domain is configured
    })
    return chain
  }
}
