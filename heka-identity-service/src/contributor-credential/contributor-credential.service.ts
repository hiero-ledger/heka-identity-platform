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
import { OpenId4VciCredentialFormatProfile } from '@credo-ts/openid4vc'
import { CredentialFormat } from 'openid4vc/issuer/dto/common/credential'
import { OpenId4VcIssuerService } from 'openid4vc/issuer/issuer.service'
import { UpdateIssuerSupportedCredentialsAction } from 'openid4vc/issuer/dto/update-issuer.dto'
import { getWalletId } from 'utils/auth'
import { withTenantAgent } from 'utils/multi-tenancy'
import { CredentialIssuanceMetadata } from 'utils/oid4vc'

import {
  CONTRIBUTOR_CREDENTIAL_DISPLAY_NAME,
  CONTRIBUTOR_CREDENTIAL_SELECTIVE_CLAIMS,
  CONTRIBUTOR_CREDENTIAL_SUPPORTED_ID,
  CONTRIBUTOR_CREDENTIAL_VCT,
} from './contributor-credential.constants'
import { ContributorCredentialPayload } from './contributor-credential.types'

/**
 * ContributorCredentialService
 *
 * Responsible for two things:
 *
 * 1. **Bootstrap** (`onApplicationBootstrap`):
 *    On every application startup, ensures the static global issuer (keyed by
 *    the demo-user's `did:hedera` DID) has the `GithubContributorCredentialSdJwt`
 *    credential configuration registered in its OID4VCI metadata.
 *    The operation is idempotent — if the issuer or the credential config
 *    already exists it is left untouched.
 *
 * 2. **Issuance** (`issueContributorCredential`):
 *    Given a verified `ContributorBinding`, builds an SD-JWT VC credential
 *    offer with the correct payload and disclosure frame (Week 2 policy) and
 *    returns the `openid-credential-offer://` URI.
 *
 * **Implementation note on status lists:**
 * SD-JWT VCs do not support revocation (per the Credo and OID4VCI spec).
 * The `OpenId4VcIssuanceSessionService.offer()` still calls
 * `statusListService.getOrCreate(authInfo)` unconditionally, which in turn
 * needs a real `User` entity in `authInfo.user`.  To avoid this dependency
 * on the database User table for a simple credential offer, this service
 * calls `tenantAgent.openid4vc.issuer.createCredentialOffer()` directly,
 * exactly as `OpenId4VcIssuanceSessionService` does internally — but skipping
 * the status list machinery that is irrelevant for SD-JWT VCs.
 */
@Injectable()
export class ContributorCredentialService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ContributorCredentialService.name)

  public constructor(
    @Inject(AGENT_TOKEN) private readonly agent: Agent,
    @Inject(AgentConfig.KEY) private readonly agentConfig: ConfigType<typeof AgentConfig>,
    private readonly em: EntityManager,
    private readonly openId4VcIssuerService: OpenId4VcIssuerService,
  ) {}

  // ---------------------------------------------------------------------------
  // Bootstrap
  // ---------------------------------------------------------------------------

  /**
   * Called once by NestJS after all modules have been initialised.
   *
   * Resolves the static-issuer tenant (the demo user's wallet), then ensures
   * that:
   *   1. An OID4VCI issuer record exists for the tenant's primary DID.
   *   2. The `GithubContributorCredentialSdJwt` credential configuration is
   *      registered in that issuer's `credential_configurations_supported`.
   *
   * Both operations are idempotent — existing records are never modified.
   */
  public async onApplicationBootstrap(): Promise<void> {
    try {
      await this.bootstrapStaticIssuer()
    } catch (error) {
      // Bootstrap failures are logged but do not prevent the application from
      // starting — the service will simply be unavailable until the underlying
      // issue is resolved (e.g. missing demo tenant wallet).
      this.logger.error(
        `ContributorCredentialService bootstrap failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Creates an OID4VCI credential offer for a verified contributor.
   *
   * The SD-JWT VC payload is built directly from the `ContributorBinding`
   * record.  The disclosure frame marks `githubUsername` and `gpgFingerprint`
   * as selectively disclosable, matching the Week 2 credential schema.
   *
   * This method calls `tenantAgent.openid4vc.issuer.createCredentialOffer()`
   * directly instead of going through `OpenId4VcIssuanceSessionService.offer()`
   * because SD-JWT VCs do not use status lists, and the session service
   * requires a full `AuthInfo.user` entity just to query the status list.
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

      // Resolve the verification method deterministically from the DID document
      const { didDocument } = await tenantAgent.dids.resolve(issuerDid)
      if (!didDocument?.verificationMethod?.length) {
        throw new NotFoundException(
          `Unable to resolve signing key for issuer DID: ${issuerDid}`,
        )
      }
      const issuerDidUrl = didDocument.verificationMethod[0].id

      const payload = this.buildPayload(binding)
      const disclosureFrame = this.buildDisclosureFrame()

      // Build issuance metadata in the same shape the credential-request mapper expects
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

      // Call Credo's issuer API directly — equivalent to what
      // OpenId4VcIssuanceSessionService.offer() calls internally, but without
      // the status-list machinery that SD-JWT VCs don't use.
      const result = await tenantAgent.openid4vc.issuer.createCredentialOffer({
        issuerId: issuerDid,
        credentialConfigurationIds: [CONTRIBUTOR_CREDENTIAL_SUPPORTED_ID],
        preAuthorizedCodeFlowConfig: {},
        issuanceMetadata: {
          credentials: [issuanceMetadata],
        },
      })

      credentialOffer = result.credentialOffer
    })

    if (!credentialOffer) {
      throw new NotFoundException('Failed to generate credential offer — tenant agent returned no offer URI.')
    }

    this.logger.log(
      `Credential offer created for contributor @${binding.githubUsername} (account ${githubAccountId})`,
    )

    return credentialOffer
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Performs the idempotent bootstrap sequence:
   *   1. Looks up (or creates) the demo user wallet and opens its tenant agent.
   *   2. Finds the tenant's primary `did:hedera` DID.
   *   3. Ensures an OID4VCI issuer record exists for that DID.
   *   4. Ensures the `GithubContributorCredentialSdJwt` credential config is
   *      registered in the issuer's `credential_configurations_supported`.
   */
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
      // Step 1: Resolve the tenant's primary DID
      const issuerDid = await this.resolveIssuerDidFromTenant(tenantAgent)

      if (!issuerDid) {
        this.logger.warn(
          'No DID found for demo tenant — skipping bootstrap. ' +
            'Call POST /prepare-wallet to create DIDs for the demo user.',
        )
        return
      }

      // Step 2: Ensure OID4VCI issuer record exists
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
        return // createIssuer already included the credential config
      }

      // Step 3: Ensure credential configuration is registered (idempotent add)
      const issuer = existingIssuers[0]
      const alreadyRegistered = issuer.credentialsSupported?.some(
        (c) => c.id === CONTRIBUTOR_CREDENTIAL_SUPPORTED_ID,
      )

      if (alreadyRegistered) {
        this.logger.debug(
          `${CONTRIBUTOR_CREDENTIAL_SUPPORTED_ID} already registered in issuer ${issuerDid} — skipping.`,
        )
        return
      }

      // Use the correct enum value ('add', not 'Add')
      await this.openId4VcIssuerService.updateIssuerMetadata(tenantAgent, issuerDid, {
        action: UpdateIssuerSupportedCredentialsAction.Add,
        credentialsSupported: [this.buildCredentialConfiguration()],
      })
      this.logger.log(`${CONTRIBUTOR_CREDENTIAL_SUPPORTED_ID} registered in existing issuer ${issuerDid}`)
    })
  }

  /**
   * Resolves the primary `did:hedera` DID (or first available DID) from
   * an already-open tenant agent session.
   *
   * Centralises the DID look-up logic so `bootstrapStaticIssuer` and
   * `issueContributorCredential` share the same resolution strategy.
   */
  private async resolveIssuerDidFromTenant(tenantAgent: {
    dids: { getCreatedDids: () => Promise<Array<{ did: string }>> }
  }): Promise<string | undefined> {
    const createdDids = await tenantAgent.dids.getCreatedDids()
    return createdDids.find((d) => d.did.startsWith('did:hedera'))?.did ?? createdDids[0]?.did
  }

  /**
   * Builds the `OpenId4VciSdJwtCredentialSupportedWithId` object describing
   * the `GithubContributorCredential` profile in the issuer metadata.
   */
  private buildCredentialConfiguration() {
    return {
      id: CONTRIBUTOR_CREDENTIAL_SUPPORTED_ID,
      format: CredentialFormat.SdJwt as CredentialFormat.SdJwt,
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

  /**
   * Builds the SD-JWT VC payload from the contributor binding.
   * All five Week 2 claims are included; the disclosure frame determines
   * which ones are selectively disclosable.
   */
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

  /**
   * Builds the disclosure frame that controls which claims are placed in
   * SD-JWT `_sd` digest groups (selectively disclosable).
   *
   * Per the Week 2 disclosure policy:
   *   - `githubUsername` and `gpgFingerprint` are selectively disclosable.
   *   - `githubAccountId`, `verifiedAt`, and `walletId` are always revealed.
   */
  private buildDisclosureFrame(): { _sd: string[] } {
    return { _sd: [...CONTRIBUTOR_CREDENTIAL_SELECTIVE_CLAIMS] }
  }

  /**
   * Resolves the Credo tenant ID for the demo user's wallet.
   * Returns `undefined` if the wallet has not been initialised yet.
   */
  private async resolveDemoTenantId(): Promise<string | undefined> {
    const demoUserName = this.agentConfig.contributorIssuerDemoUser
    const walletId = getWalletId({ role: Role.Admin, userId: demoUserName })
    const em = this.em.fork()
    const wallet = await em.findOne(Wallet, { id: walletId })
    return wallet?.tenantId
  }
}
