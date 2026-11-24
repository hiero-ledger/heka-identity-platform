import { DidDocument } from '@credo-ts/core'
import { OpenId4VciCredentialFormatProfile } from '@credo-ts/openid4vc'
import { EntityManager } from '@mikro-orm/core'
import {
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common'
import { ConfigType } from '@nestjs/config'

import { Agent, AGENT_TOKEN } from 'common/agent'
import { AuthInfo, Role } from 'common/auth'
import { Wallet } from 'common/entities'
import { InjectLogger, Logger } from 'common/logger'
import AgentConfig from 'config/agent'
import { ContributorOnboardingService, type VerifiedContributor } from 'contributor-onboarding'
import { CredentialFormat } from 'openid4vc/issuer/dto/common/credential'
import {
  OpenId4VcIssuersUpdateMetadataDto,
  UpdateIssuerSupportedCredentialsAction,
} from 'openid4vc/issuer/dto/update-issuer.dto'
import { OpenId4VcIssuerService } from 'openid4vc/issuer/issuer.service'
import { getWalletId } from 'utils/auth'
import { withTenantAgent } from 'utils/multi-tenancy'
import { CredentialIssuanceMetadata } from 'utils/oid4vc'

import {
  CONTRIBUTOR_CREDENTIAL_DISPLAY_NAME,
  CONTRIBUTOR_CREDENTIAL_LIFETIME_SECONDS,
  CONTRIBUTOR_CREDENTIAL_OFFER_TTL_SECONDS,
  CONTRIBUTOR_CREDENTIAL_SELECTIVE_CLAIMS,
  CONTRIBUTOR_CREDENTIAL_SUPPORTED_ID,
  CONTRIBUTOR_CREDENTIAL_TX_CODE_LENGTH,
  CONTRIBUTOR_CREDENTIAL_VCT,
} from './contributor-credential.constants'
import { ContributorCredentialPayload } from './contributor-credential.types'

/**
 * Issues the contributor credential from the provisional `DEMO_USER` issuer: registers the credential
 * configuration on that issuer (at startup, else on the next offer) and creates offers from the caller's
 * verified binding. Offers call Credo's `createCredentialOffer` directly, not the generic
 * `OpenId4VcIssuanceSessionService.offer()`, so the credential has no status list entry; `exp` bounds it.
 */
@Injectable()
export class ContributorCredentialService implements OnApplicationBootstrap {
  private issuerConfigured = false
  private configurationLock: Promise<boolean> | null = null

  public constructor(
    @Inject(AGENT_TOKEN) private readonly agent: Agent,
    @Inject(AgentConfig.KEY) private readonly agentConfig: ConfigType<typeof AgentConfig>,
    private readonly em: EntityManager,
    private readonly openId4VcIssuerService: OpenId4VcIssuerService,
    private readonly contributorOnboardingService: ContributorOnboardingService,
    @InjectLogger(ContributorCredentialService) private readonly logger: Logger,
  ) {}

  public async onApplicationBootstrap(): Promise<void> {
    try {
      await this.ensureIssuerConfigured()
    } catch (error) {
      // Every failure is retried on the next offer, so recovery needs no restart. A missing demo wallet is expected.
      if (error instanceof NotFoundException) return
      this.logger.error(
        `ContributorCredentialService bootstrap failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  /**
   * Registers the issuer when it is not ready yet. Overlapping calls share one
   * attempt. A failed or skipped attempt is not remembered, so a later wallet
   * or DID setup can succeed without restarting the process.
   */
  private ensureIssuerConfigured(): Promise<void> {
    if (this.issuerConfigured) return Promise.resolve()
    const pending = this.configurationLock ?? this.startIssuerConfiguration()
    return pending.then((ready) => {
      if (!ready) {
        throw new NotFoundException(
          'Static contributor credential issuer is not configured. Initialise the demo tenant wallet and retry.',
        )
      }
      this.issuerConfigured = true
    })
  }

  private startIssuerConfiguration(): Promise<boolean> {
    const run = this.bootstrapStaticIssuer().finally(() => {
      if (this.configurationLock === run) this.configurationLock = null
    })
    this.configurationLock = run
    return run
  }

  /**
   * Creates an offer for the caller's own verified binding. The transaction code is not part of the offer URI.
   *
   * @throws {NotFoundException} No binding for this user, or the issuer tenant is missing.
   * @throws {ConflictException} GitHub is linked but GPG verification is not complete.
   */
  public async issueContributorCredential(
    authInfo: AuthInfo,
  ): Promise<{ credentialOffer: string; txCode: string; expiresAt: string }> {
    const contributor = await this.contributorOnboardingService.getVerifiedBindingByUser(authInfo.userId)
    await this.ensureIssuerConfigured()

    const tenantId = await this.resolveDemoTenantId()
    if (!tenantId) {
      throw new NotFoundException(
        'Static contributor credential issuer tenant not found. Ensure the demo tenant wallet is initialised.',
      )
    }

    let credentialOffer: string | undefined
    let txCode: string | undefined
    let expiresAt: Date | undefined

    await withTenantAgent({ agent: this.agent, tenantId }, async (tenantAgent) => {
      const issuerDid = await this.resolveIssuerDidFromTenant(tenantAgent)
      if (!issuerDid) {
        throw new NotFoundException(
          'Static contributor credential issuer DID not found. ' +
            'Ensure the demo tenant wallet has a DID created via POST /prepare-wallet.',
        )
      }

      const { didDocument } = await tenantAgent.dids.resolve(issuerDid)
      const issuerDidUrl = this.selectAssertionKeyId(issuerDid, didDocument)

      const payload = this.buildPayload(contributor)
      const disclosureFrame = this.buildDisclosureFrame()

      // The shape the credential-request mapper expects
      const issuanceMetadata: CredentialIssuanceMetadata = {
        format: OpenId4VciCredentialFormatProfile.SdJwtVc,
        credentialSupportedId: CONTRIBUTOR_CREDENTIAL_SUPPORTED_ID,
        type: CONTRIBUTOR_CREDENTIAL_VCT,
        issuer: {
          did: issuerDid,
          didUrl: issuerDidUrl,
        },
        payload,
        disclosureFrame,
      }

      const result = await tenantAgent.openid4vc.issuer.createCredentialOffer({
        issuerId: issuerDid,
        credentialConfigurationIds: [CONTRIBUTOR_CREDENTIAL_SUPPORTED_ID],
        preAuthorizedCodeFlowConfig: {
          txCode: {
            input_mode: 'numeric',
            length: CONTRIBUTOR_CREDENTIAL_TX_CODE_LENGTH,
            description: 'Enter the code shown on the Heka contributor page.',
          },
        },
        expirationInSeconds: CONTRIBUTOR_CREDENTIAL_OFFER_TTL_SECONDS,
        issuanceMetadata: {
          credentials: [issuanceMetadata],
        },
      })

      credentialOffer = result.credentialOffer
      txCode = result.issuanceSession.userPin
      expiresAt = result.issuanceSession.expiresAt
    })

    if (!credentialOffer || !txCode || !expiresAt) {
      throw new InternalServerErrorException(
        'Failed to generate a transaction-code credential offer. The offer URI alone is not enough to issue this credential.',
      )
    }

    this.logger.info(
      `Credential offer created for contributor @${contributor.githubUsername} (account ${contributor.githubAccountId})`,
    )

    return { credentialOffer, txCode, expiresAt: expiresAt.toISOString() }
  }

  /**
   * Creates the issuer for the demo wallet's DID with the credential configuration, adds the configuration
   * to an existing issuer, or replaces it there so its binding methods stay current. Resolves to false
   * when the demo wallet or its DID doesn't exist yet.
   */
  private async bootstrapStaticIssuer(): Promise<boolean> {
    const tenantId = await this.resolveDemoTenantId()
    if (!tenantId) {
      this.logger.warn(
        'Demo tenant wallet not found — skipping contributor credential issuer bootstrap. ' +
          `Set the DEMO_USER environment variable and call POST /prepare-wallet to initialise the tenant.`,
      )
      return false
    }

    let configured = false
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
        this.logger.info(`OID4VCI issuer registered for DID ${issuerDid}`)
        configured = true
        return // createIssuer already included the credential config
      }

      const issuer = existingIssuers[0]
      const alreadyRegistered = issuer.credentialsSupported?.some((c) => c.id === CONTRIBUTOR_CREDENTIAL_SUPPORTED_ID)

      if (alreadyRegistered) {
        const retained = (issuer.credentialsSupported ?? []).filter(
          (credential) => credential.id !== CONTRIBUTOR_CREDENTIAL_SUPPORTED_ID,
        )
        await this.openId4VcIssuerService.updateIssuerMetadata(tenantAgent, issuerDid, {
          action: UpdateIssuerSupportedCredentialsAction.Replace,
          credentialsSupported: [
            ...retained,
            this.buildCredentialConfiguration(),
          ] as OpenId4VcIssuersUpdateMetadataDto['credentialsSupported'],
          display: issuer.display,
        })
        this.logger.info(
          `${CONTRIBUTOR_CREDENTIAL_SUPPORTED_ID} credential configuration updated for issuer ${issuerDid}`,
        )
        configured = true
        return
      }

      await this.openId4VcIssuerService.updateIssuerMetadata(tenantAgent, issuerDid, {
        action: UpdateIssuerSupportedCredentialsAction.Add,
        credentialsSupported: [this.buildCredentialConfiguration()],
      })
      this.logger.info(`${CONTRIBUTOR_CREDENTIAL_SUPPORTED_ID} registered in existing issuer ${issuerDid}`)
      configured = true
    })
    return configured
  }

  /** The tenant's `did:hedera` DID, else its first DID. */
  private async resolveIssuerDidFromTenant(tenantAgent: {
    dids: { getCreatedDids: () => Promise<Array<{ did: string }>> }
  }): Promise<string | undefined> {
    const createdDids = await tenantAgent.dids.getCreatedDids()
    return createdDids.find((d) => d.did.startsWith('did:hedera'))?.did ?? createdDids[0]?.did
  }

  private buildCredentialConfiguration() {
    return {
      id: CONTRIBUTOR_CREDENTIAL_SUPPORTED_ID,
      format: CredentialFormat.SdJwt as CredentialFormat.SdJwt,
      vct: CONTRIBUTOR_CREDENTIAL_VCT,
      cryptographic_binding_methods_supported: ['jwk'],
      claims: {
        githubAccountId: { mandatory: true },
        githubUsername: { mandatory: true },
        gpgFingerprint: { mandatory: true },
        verifiedAt: { mandatory: true },
      },
      order: ['githubAccountId', 'githubUsername', 'gpgFingerprint', 'verifiedAt'],
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

  private buildPayload(contributor: VerifiedContributor): ContributorCredentialPayload {
    return {
      vct: CONTRIBUTOR_CREDENTIAL_VCT,
      githubAccountId: contributor.githubAccountId,
      githubUsername: contributor.githubUsername,
      gpgFingerprint: contributor.gpgFingerprint,
      verifiedAt: contributor.verifiedAt,
      exp: Math.floor(Date.now() / 1000) + CONTRIBUTOR_CREDENTIAL_LIFETIME_SECONDS,
    }
  }

  private buildDisclosureFrame(): { _sd: string[] } {
    return { _sd: [...CONTRIBUTOR_CREDENTIAL_SELECTIVE_CLAIMS] }
  }

  /** The Credo tenant of the `DEMO_USER` wallet, if that wallet exists. */
  private async resolveDemoTenantId(): Promise<string | undefined> {
    const demoUserName = this.agentConfig.contributorIssuerDemoUser
    const walletId = getWalletId({ role: Role.User, userId: demoUserName })
    const em = this.em.fork()
    const wallet = await em.findOne(Wallet, { id: walletId })
    return wallet?.tenantId
  }

  /**
   * The signing key, chosen by purpose with Credo's `dereferenceKey`: `#assertion-key` if the DID publishes
   * it, else `#did-root-key` (Hedera), else the only assertion method. Never the first verification method:
   * that array is not ordered by purpose.
   */
  private selectAssertionKeyId(issuerDid: string, didDocument: unknown): string {
    const document = this.asDidDocument(issuerDid, didDocument)
    if (!document) {
      throw new NotFoundException(`Unable to resolve signing key for issuer DID: ${issuerDid}`)
    }

    for (const keyId of ['#assertion-key', '#did-root-key']) {
      const resolved = this.dereferenceAssertionKey(document, keyId)
      if (resolved) return resolved
    }

    const assertionMethods = document.assertionMethod ?? []
    if (assertionMethods.length === 1) {
      const only = assertionMethods[0]
      const keyId = typeof only === 'string' ? only : only.id
      const resolved = this.dereferenceAssertionKey(document, keyId)
      if (resolved) return resolved
    }

    throw new NotFoundException(
      `Unable to resolve an assertion key for issuer DID: ${issuerDid}. Expected #assertion-key or #did-root-key.`,
    )
  }

  private asDidDocument(issuerDid: string, didDocument: unknown): DidDocument | undefined {
    if (!didDocument || typeof didDocument !== 'object') return undefined
    if (didDocument instanceof DidDocument) return didDocument
    const source = didDocument as ConstructorParameters<typeof DidDocument>[0]
    return new DidDocument({ ...source, id: source.id || issuerDid })
  }

  private dereferenceAssertionKey(document: DidDocument, keyId: string): string | undefined {
    try {
      return document.dereferenceKey(keyId, ['assertionMethod']).id
    } catch {
      return undefined
    }
  }
}
