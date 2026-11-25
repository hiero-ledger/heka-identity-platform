import { RecordNotFoundError } from '@credo-ts/core'
import { OpenId4VciCredentialFormatProfile } from '@credo-ts/openid4vc'
import { EntityManager } from '@mikro-orm/core'
import { Inject, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common'
import { ConfigType } from '@nestjs/config'

import { Agent, AGENT_TOKEN } from 'common/agent'
import { AuthInfo, Role } from 'common/auth'
import { User, Wallet } from 'common/entities'
import { InjectLogger, Logger } from 'common/logger'
import GithubConfig from 'config/github'
import { ContributorOnboardingService } from 'contributor-onboarding'
import { OpenId4VcIssuanceSessionsCreateOfferDto } from 'openid4vc/issuance-sessions/dto'
import { OpenId4VcIssuanceSessionService } from 'openid4vc/issuance-sessions/issuance-session.service'
import { getOrganizationWalletId } from 'utils/auth'
import { withTenantAgent } from 'utils/multi-tenancy'

import { ContributorCredentialIssuance } from './contributor-credential-issuance.entity'
import {
  CONTRIBUTOR_CREDENTIAL_LIFETIME_SECONDS,
  CONTRIBUTOR_CREDENTIAL_OFFER_TTL_SECONDS,
  CONTRIBUTOR_CREDENTIAL_SELECTIVE_CLAIMS,
  CONTRIBUTOR_CREDENTIAL_TX_CODE_LENGTH,
} from './contributor-credential.constants'
import { ContributorCredentialPayload } from './contributor-credential.types'
import { ContributorIssuerService } from './contributor-issuer.service'
import {
  ContributorCredentialOfferResponseDto,
  ContributorCredentialOfferStateDto,
} from './dto/contributor-credential-offer.dto'

const OFFER_NOT_FOUND = 'Contributor credential offer not found'

/**
 * Offers the contributor credential from the caller's verified binding. The offer is the generic OpenID4VC one,
 * made as the issuer organization's wallet, so the credential gets a status list entry and shows in that
 * organization's issued credentials like any other.
 */
@Injectable()
export class ContributorCredentialService {
  public constructor(
    @Inject(AGENT_TOKEN) private readonly agent: Agent,
    @Inject(GithubConfig.KEY) private readonly config: ConfigType<typeof GithubConfig>,
    private readonly em: EntityManager,
    private readonly issuanceSessionService: OpenId4VcIssuanceSessionService,
    private readonly contributorIssuerService: ContributorIssuerService,
    private readonly contributorOnboardingService: ContributorOnboardingService,
    @InjectLogger(ContributorCredentialService) private readonly logger: Logger,
  ) {}

  /**
   * Creates an offer for the caller's own verified binding. The transaction code is not part of the offer URI.
   *
   * @throws {NotFoundException} No binding for this user.
   * @throws {ConflictException} GitHub is linked but GPG verification is not complete.
   * @throws {ServiceUnavailableException} The issuer organization is not set up.
   */
  public async offer(authInfo: AuthInfo): Promise<ContributorCredentialOfferResponseDto> {
    const contributor = await this.contributorOnboardingService.getVerifiedBindingByUser(authInfo.userId)
    const issuer = await this.contributorIssuerService.resolveIssuer()

    // `user` stays the caller: the status list service records it only as the creator of a new list
    const issuerAuthInfo: AuthInfo = {
      ...authInfo,
      role: Role.OrgAdmin,
      orgId: this.config.issuerOrgId,
      walletId: issuer.walletId,
      tenantId: issuer.tenantId,
    }
    const payload: ContributorCredentialPayload = {
      githubAccountId: contributor.githubAccountId,
      githubUsername: contributor.githubUsername,
      gpgFingerprint: contributor.gpgFingerprint,
      verifiedAt: contributor.verifiedAt,
      exp: Math.floor(Date.now() / 1000) + CONTRIBUTOR_CREDENTIAL_LIFETIME_SECONDS,
    }
    const request: OpenId4VcIssuanceSessionsCreateOfferDto = {
      publicIssuerId: issuer.publicIssuerId,
      credentials: [
        {
          credentialSupportedId: issuer.supportedCredentialId,
          format: OpenId4VciCredentialFormatProfile.SdJwtVc,
          issuer: { method: 'did', did: issuer.did },
          payload,
          disclosureFrame: { _sd: [...CONTRIBUTOR_CREDENTIAL_SELECTIVE_CLAIMS] },
        },
      ],
      preAuthorizedCodeFlowConfig: {
        txCode: {
          input_mode: 'numeric',
          length: CONTRIBUTOR_CREDENTIAL_TX_CODE_LENGTH,
          description: 'Enter the code shown on the Heka contributor page.',
        },
      },
      offerExpiresInSeconds: CONTRIBUTOR_CREDENTIAL_OFFER_TTL_SECONDS,
    }

    const { credentialOffer, issuanceSession } = await withTenantAgent(
      { agent: this.agent, tenantId: issuer.tenantId },
      (tenantAgent) => this.issuanceSessionService.offer(issuerAuthInfo, tenantAgent, request),
    )
    const { userPin, expiresAt } = issuanceSession
    if (!userPin || !expiresAt) {
      throw new InternalServerErrorException('The credential offer has no transaction code or expiry')
    }

    this.em.persist(
      Object.assign(new ContributorCredentialIssuance(), {
        user: this.em.getReference(User, authInfo.userId),
        issuanceSessionId: issuanceSession.id,
        githubAccountId: contributor.githubAccountId,
        githubUsername: contributor.githubUsername,
        gpgFingerprint: contributor.gpgFingerprint,
      }),
    )
    await this.em.flush()

    this.logger.info(
      `Credential offer ${issuanceSession.id} created for contributor @${contributor.githubUsername} (account ${contributor.githubAccountId})`,
    )
    return new ContributorCredentialOfferResponseDto(
      credentialOffer,
      userPin,
      expiresAt.toISOString(),
      issuanceSession.id,
    )
  }

  /**
   * The state of one of the caller's own offers, read from its issuance session.
   *
   * @throws {NotFoundException} The caller made no such offer, or its session is gone.
   */
  public async getOfferState(
    authInfo: AuthInfo,
    issuanceSessionId: string,
  ): Promise<ContributorCredentialOfferStateDto> {
    const record = await this.em.findOne(ContributorCredentialIssuance, { issuanceSessionId, user: authInfo.userId })
    const wallet = record && (await this.em.findOne(Wallet, { id: getOrganizationWalletId(this.config.issuerOrgId!) }))
    if (!wallet) throw new NotFoundException(OFFER_NOT_FOUND)

    const session = await withTenantAgent({ agent: this.agent, tenantId: wallet.tenantId }, async (tenantAgent) => {
      try {
        return await tenantAgent.openid4vc.issuer.getIssuanceSessionById(issuanceSessionId)
      } catch (error) {
        if (error instanceof RecordNotFoundError) return undefined
        throw error
      }
    })
    if (!session) throw new NotFoundException(OFFER_NOT_FOUND)
    if (!session.expiresAt) throw new InternalServerErrorException('The credential offer has no expiry')

    return new ContributorCredentialOfferStateDto(session.state, session.expiresAt.toISOString())
  }
}
