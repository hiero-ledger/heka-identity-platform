import { OpenId4VciCredentialFormatProfile } from '@credo-ts/openid4vc'
import { EntityManager } from '@mikro-orm/core'
import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common'
import { ConfigType } from '@nestjs/config'

import { Agent, AGENT_TOKEN } from 'common/agent'
import { Role } from 'common/auth'
import { Wallet } from 'common/entities'
import AgentConfig from 'config/agent'
import { ContributorBinding } from 'contributor-onboarding'
import { CredentialFormat } from 'openid4vc/issuer/dto/common/credential'
import { UpdateIssuerSupportedCredentialsAction } from 'openid4vc/issuer/dto/update-issuer.dto'
import { OpenId4VcIssuerService } from 'openid4vc/issuer/issuer.service'
import { getWalletId } from 'utils/auth'
import { withTenantAgent } from 'utils/multi-tenancy'
import { CredentialIssuanceMetadata } from 'utils/oid4vc'

import {
  CONTRIBUTOR_CREDENTIAL_DISCLOSURE_FRAME,
  CONTRIBUTOR_CREDENTIAL_DISPLAY_NAME,
  CONTRIBUTOR_CREDENTIAL_SUPPORTED_ID,
  CONTRIBUTOR_CREDENTIAL_VCT,
} from './contributor-credential.constants'
import { ContributorCredentialPayload } from './contributor-credential.types'

@Injectable()
export class ContributorCredentialService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ContributorCredentialService.name)

  public constructor(
    @Inject(AGENT_TOKEN) private readonly agent: Agent,
    @Inject(AgentConfig.KEY) private readonly agentConfig: ConfigType<typeof AgentConfig>,
    private readonly em: EntityManager,
    private readonly openId4VcIssuerService: OpenId4VcIssuerService,
  ) {}

  public async onApplicationBootstrap(): Promise<void> {
    try {
      await this.bootstrapStaticIssuer()
    } catch (error) {
      this.logger.error(
        `ContributorCredentialService bootstrap failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  /**
   * Creates an OID4VCI credential offer for a verified contributor.
   *
   * @param githubAccountId - The contributor's immutable GitHub numeric account ID.
   * @returns An `openid-credential-offer://` URI the wallet can scan.
   *
   * @throws {NotFoundException} No verified binding found for the given account ID.
   * @throws {ConflictException} The binding exists but GPG verification is not yet complete.
   */
  public async issueContributorCredential(githubAccountId: string): Promise<string> {
    const binding = await this.em.findOne(ContributorBinding, { githubAccountId })

    if (!binding) {
      throw new NotFoundException(
        `No contributor binding found for GitHub account ID '${githubAccountId}'. ` +
          'The contributor must complete the GitHub OAuth login flow first.',
      )
    }

    if (!binding.gpgFingerprint || !binding.verifiedAt) {
      throw new ConflictException(
        `Contributor @${binding.githubUsername} has not yet completed GPG verification. ` +
          'A credential can only be issued after successful signature verification.',
      )
    }

    const tenantId = await this.resolveDemoTenantId()
    if (!tenantId) {
      throw new NotFoundException(
        'Static contributor credential issuer tenant not found. Ensure the demo tenant wallet is initialised.',
      )
    }

    let credentialOffer: string | undefined

    await withTenantAgent({ agent: this.agent, tenantId }, async (tenantAgent) => {
      const issuerDid = await this.resolveIssuerDidFromTenant(tenantAgent)
      if (!issuerDid) {
        throw new NotFoundException(
          'Static contributor credential issuer DID not found. ' +
            'Ensure the demo tenant wallet has a DID created via POST /prepare-wallet.',
        )
      }

      const { didDocument } = await tenantAgent.dids.resolve(issuerDid)
      if (!didDocument?.verificationMethod?.length) {
        throw new NotFoundException(`Unable to resolve signing key for issuer DID: ${issuerDid}`)
      }
      const issuerDidUrl = didDocument.verificationMethod[0].id

      const issuanceMetadata: CredentialIssuanceMetadata = {
        format: OpenId4VciCredentialFormatProfile.SdJwtVc,
        credentialSupportedId: CONTRIBUTOR_CREDENTIAL_SUPPORTED_ID,
        type: CONTRIBUTOR_CREDENTIAL_VCT,
        issuer: { did: issuerDid, didUrl: issuerDidUrl },
        payload: this.buildPayload(binding),
        disclosureFrame: CONTRIBUTOR_CREDENTIAL_DISCLOSURE_FRAME,
      }

      const result = await tenantAgent.openid4vc.issuer.createCredentialOffer({
        issuerId: issuerDid,
        credentialConfigurationIds: [CONTRIBUTOR_CREDENTIAL_SUPPORTED_ID],
        preAuthorizedCodeFlowConfig: {},
        issuanceMetadata: { credentials: [issuanceMetadata] },
      })

      credentialOffer = result.credentialOffer
    })

    if (!credentialOffer) {
      throw new NotFoundException('Failed to generate credential offer — tenant agent returned no offer URI.')
    }

    this.logger.log(`Credential offer created for contributor @${binding.githubUsername} (account ${githubAccountId})`)

    return credentialOffer
  }

  private async bootstrapStaticIssuer(): Promise<void> {
    const tenantId = await this.resolveDemoTenantId()
    if (!tenantId) {
      this.logger.warn(
        'Demo tenant wallet not found — skipping contributor credential issuer bootstrap. ' +
          `Set the DEMO_USER environment variable and call POST /prepare-wallet to initialise the tenant.`,
      )
      return
    }

    await withTenantAgent({ agent: this.agent, tenantId }, async (tenantAgent) => {
      const issuerDid = await this.resolveIssuerDidFromTenant(tenantAgent)

      if (!issuerDid) {
        this.logger.warn(
          'No DID found for demo tenant — skipping bootstrap. ' +
            'Call POST /prepare-wallet to create DIDs for the demo user.',
        )
        return
      }

      const existingIssuers = await this.openId4VcIssuerService.find(tenantAgent, issuerDid)
      if (!existingIssuers.length) {
        await this.openId4VcIssuerService.createIssuer(tenantAgent, {
          publicIssuerId: issuerDid,
          credentialsSupported: [this.buildCredentialConfiguration()],
          display: [
            {
              name: 'Hiero Contributor Identity Issuer',
              description: 'Issues verified GitHub contributor credentials for the Hiero ecosystem.',
              background_color: '#1a1a2e',
              logo: { alt_text: 'Hiero Logo' },
            },
          ],
        })
        this.logger.log(`OID4VCI issuer registered for DID ${issuerDid}`)
        return
      }

      const issuer = existingIssuers[0]
      const alreadyRegistered = issuer.credentialsSupported?.some((c) => c.id === CONTRIBUTOR_CREDENTIAL_SUPPORTED_ID)

      if (alreadyRegistered) {
        this.logger.debug(
          `${CONTRIBUTOR_CREDENTIAL_SUPPORTED_ID} already registered in issuer ${issuerDid} — skipping.`,
        )
        return
      }

      await this.openId4VcIssuerService.updateIssuerMetadata(tenantAgent, issuerDid, {
        action: UpdateIssuerSupportedCredentialsAction.Add,
        credentialsSupported: [this.buildCredentialConfiguration()],
      })
      this.logger.log(`${CONTRIBUTOR_CREDENTIAL_SUPPORTED_ID} registered in existing issuer ${issuerDid}`)
    })
  }

  private async resolveIssuerDidFromTenant(tenantAgent: {
    dids: { getCreatedDids: () => Promise<Array<{ did: string }>> }
  }): Promise<string | undefined> {
    const createdDids = await tenantAgent.dids.getCreatedDids()
    return createdDids.find((d) => d.did.startsWith('did:hedera'))?.did ?? createdDids[0]?.did
  }

  private buildCredentialConfiguration() {
    return {
      id: CONTRIBUTOR_CREDENTIAL_SUPPORTED_ID,
      format: CredentialFormat.SdJwt,
      vct: CONTRIBUTOR_CREDENTIAL_VCT,
      claims: {
        githubAccountId: { mandatory: true },
        githubUsername: { mandatory: true },
        gpgFingerprint: { mandatory: true },
        verifiedAt: { mandatory: true },
        walletId: { mandatory: true },
      },
      order: ['githubAccountId', 'githubUsername', 'gpgFingerprint', 'verifiedAt', 'walletId'],
      display: [
        {
          name: CONTRIBUTOR_CREDENTIAL_DISPLAY_NAME,
          description:
            'Verifiable credential proving that the holder is a verified Hiero ecosystem contributor ' +
            'with a confirmed GitHub account and GPG key.',
          background_color: '#1a1a2e',
          text_color: '#ffffff',
          logo: { alt_text: 'Hiero Contributor Badge' },
          locale: 'en-US',
        },
      ],
    }
  }

  private buildPayload(binding: ContributorBinding): ContributorCredentialPayload {
    return {
      vct: CONTRIBUTOR_CREDENTIAL_VCT,
      githubAccountId: binding.githubAccountId,
      githubUsername: binding.githubUsername,
      gpgFingerprint: binding.gpgFingerprint!,
      verifiedAt: binding.verifiedAt!.toISOString(),
      walletId: binding.walletId,
    }
  }

  private async resolveDemoTenantId(): Promise<string | undefined> {
    const demoUserName = this.agentConfig.contributorIssuerDemoUser
    const walletId = getWalletId({ role: Role.User, userId: demoUserName })
    const em = this.em.fork()
    const wallet = await em.findOne(Wallet, { id: walletId })
    return wallet?.tenantId
  }
}
