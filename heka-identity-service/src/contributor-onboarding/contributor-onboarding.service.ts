import * as crypto from 'crypto'

import { EntityManager, UniqueConstraintViolationException } from '@mikro-orm/core'
import { HttpService } from '@nestjs/axios'
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigType } from '@nestjs/config'
import axios from 'axios'
import { firstValueFrom } from 'rxjs'

import { AuthInfo } from 'common/auth'
import { User } from 'common/entities'
import { InjectLogger, Logger } from 'common/logger'
import GithubConfig from 'config/github'
import { GpgChallenge } from 'gpg-challenge/gpg-challenge.entity'

import { ContributorAuditEvent, ContributorAuditEventType } from './contributor-audit-event.entity'
import { ContributorBinding } from './contributor-binding.entity'
import {
  VerifiedContributor,
  toContributorAuditEventView,
  toContributorBindingView,
} from './contributor-onboarding.types'
import { ContributorOnboardingStatusDto } from './dto/contributor-onboarding-status.dto'
import { GithubLinkCallbackResponseDto, GithubLinkStartResponseDto } from './dto/github-link-response.dto'
import { LinkAttemptStatus, OAuthLinkAttempt } from './oauth-link-attempt.entity'

const LINK_ATTEMPT_TTL_MS = 5 * 60 * 1000

const ACCOUNT_LINKED_TO_ANOTHER_USER = 'This GitHub account is already linked to another Heka user'
const CONCURRENT_LINK_FOR_USER =
  'Another request linked a GitHub account to this Heka user at the same time. Check the status and link again if needed.'
const GITHUB_ACCOUNT_UNIQUE_CONSTRAINT = 'contributor_binding_github_account_id_unique'
const USER_UNIQUE_CONSTRAINT = 'contributor_binding_user_id_unique'

interface AuditInput {
  eventType: ContributorAuditEventType
  userId: string
  tenantId: string
  githubAccountId?: string
  githubUsername?: string
  walletId?: string
  gpgFingerprint?: string
  metadata?: Record<string, unknown>
}

/**
 * GitHub account linking and the contributor binding.
 * A binding belongs to the OIDC subject (`AuthInfo.userId`); its wallet and tenant are refreshed on
 * link and verification, so a role or organization change keeps it.
 */
@Injectable()
export class ContributorOnboardingService {
  public constructor(
    private readonly em: EntityManager,
    private readonly httpService: HttpService,
    @Inject(GithubConfig.KEY) private readonly github: ConfigType<typeof GithubConfig>,
    @InjectLogger(ContributorOnboardingService) private readonly logger: Logger,
  ) {}

  public async getStatus(authInfo: AuthInfo): Promise<ContributorOnboardingStatusDto> {
    const binding = await this.findBinding(authInfo.userId)
    const auditEvents = await this.em.find(
      ContributorAuditEvent,
      { userId: authInfo.userId },
      { orderBy: { createdAt: 'DESC' }, limit: 20 },
    )

    return {
      github: binding ? { accountId: binding.githubAccountId, username: binding.githubUsername } : undefined,
      binding: binding ? toContributorBindingView(binding) : undefined,
      verificationStatus: binding?.verifiedAt ? 'GpgVerified' : binding ? 'GitHubConnected' : 'NotConnected',
      auditEvents: auditEvents.map(toContributorAuditEventView),
    }
  }

  /** Binding for the authenticated user. GitHub must already be linked. */
  public async getRequiredBindingForUser(authInfo: AuthInfo): Promise<ContributorBinding> {
    const binding = await this.findBinding(authInfo.userId)
    if (!binding) {
      throw new ConflictException('Link a GitHub account before requesting contributor verification.')
    }
    return binding
  }

  /**
   * Verified binding for credential issuance.
   * The GitHub account id is read from this row, not from the request.
   */
  public async getVerifiedBindingByUser(userId: string): Promise<VerifiedContributor> {
    const binding = await this.findBinding(userId)
    if (!binding) {
      throw new NotFoundException('No contributor binding found for this user.')
    }
    if (!binding.gpgFingerprint || !binding.verifiedAt) {
      throw new ConflictException(`Contributor @${binding.githubUsername} has not completed GPG verification.`)
    }

    return {
      githubAccountId: binding.githubAccountId,
      githubUsername: binding.githubUsername,
      gpgFingerprint: binding.gpgFingerprint,
      verifiedAt: binding.verifiedAt.toISOString(),
    }
  }

  /** Starts a GitHub OAuth link. The raw state token is returned only inside the authorization URL. */
  public async createGithubLinkRequest(authInfo: AuthInfo): Promise<GithubLinkStartResponseDto> {
    await this.purgeExpiredLinkAttempts()

    const stateToken = crypto.randomBytes(32).toString('hex')
    const codeVerifier = crypto.randomBytes(32).toString('base64url')
    const attempt = new OAuthLinkAttempt()
    attempt.user = this.em.getReference(User, authInfo.userId)
    attempt.walletId = authInfo.walletId
    attempt.tenantId = authInfo.tenantId
    attempt.stateHash = this.sha256(stateToken)
    attempt.codeVerifier = codeVerifier
    attempt.expiresAt = new Date(Date.now() + LINK_ATTEMPT_TTL_MS)
    this.em.persist(attempt)
    await this.em.flush()

    // No scopes: the numeric id and login come from the token's own user, the GPG key from the public .gpg file
    const url = new URL(this.github.authorizeUrl)
    url.searchParams.set('client_id', this.github.clientId!)
    url.searchParams.set('redirect_uri', this.github.callbackUrl!)
    url.searchParams.set('state', stateToken)
    url.searchParams.set('code_challenge', this.sha256(codeVerifier, 'base64url'))
    url.searchParams.set('code_challenge_method', 'S256')
    return { authorizationUrl: url.toString() }
  }

  /**
   * Exchanges the GitHub code for the user who started the link.
   * Does not issue a session. A different GitHub account clears GPG verification.
   * The GitHub token is used once to read the account, then revoked.
   */
  public async completeGithubLink(
    authInfo: AuthInfo,
    code: string,
    stateToken: string,
  ): Promise<GithubLinkCallbackResponseDto> {
    const stateHash = this.sha256(stateToken)
    const attempt = await this.em.findOne(OAuthLinkAttempt, {
      stateHash,
      user: authInfo.userId,
      tenantId: authInfo.tenantId,
      walletId: authInfo.walletId,
      status: LinkAttemptStatus.Pending,
      expiresAt: { $gt: new Date() },
    })
    const codeVerifier = attempt?.codeVerifier
    // The conditional update keeps the state single-use under concurrent callbacks, and drops the PKCE verifier
    const consumed = attempt
      ? await this.em.nativeUpdate(
          OAuthLinkAttempt,
          { id: attempt.id, status: LinkAttemptStatus.Pending },
          { status: LinkAttemptStatus.Consumed, codeVerifier: null },
        )
      : 0
    if (!codeVerifier || consumed === 0) {
      throw new BadRequestException('Invalid, expired, or already-consumed OAuth state')
    }

    const accessToken = await this.exchangeCodeForToken(code, codeVerifier)
    let githubUser: { id: string; login: string }
    try {
      githubUser = await this.fetchGithubUser(accessToken)
    } finally {
      await this.revokeGithubToken(accessToken)
    }

    const taken = await this.em.findOne(ContributorBinding, { githubAccountId: githubUser.id })
    if (taken && taken.user.id !== authInfo.userId) {
      throw new ConflictException(ACCOUNT_LINKED_TO_ANOTHER_USER)
    }

    const fields = {
      tenantId: authInfo.tenantId,
      walletId: authInfo.walletId,
      githubAccountId: githubUser.id,
      githubUsername: githubUser.login,
    }
    const existing = await this.findBinding(authInfo.userId)
    try {
      if (existing) {
        // A concurrent callback can pass the checks above as well: the update applies only to the account read here
        const accountChanged = existing.githubAccountId !== githubUser.id
        const updated = await this.em.nativeUpdate(
          ContributorBinding,
          { id: existing.id, githubAccountId: existing.githubAccountId },
          {
            ...fields,
            ...(accountChanged ? { gpgFingerprint: null, verifiedAt: null } : {}),
            updatedAt: new Date(),
          },
        )
        if (updated === 0) throw new ConflictException(CONCURRENT_LINK_FOR_USER)
      } else {
        this.em.persist(
          Object.assign(new ContributorBinding(), fields, { user: this.em.getReference(User, authInfo.userId) }),
        )
      }
      this.persistAudit({
        eventType: ContributorAuditEventType.BindingUpdated,
        userId: authInfo.userId,
        tenantId: authInfo.tenantId,
        githubAccountId: githubUser.id,
        githubUsername: githubUser.login,
        walletId: authInfo.walletId,
        metadata: { source: 'github-link' },
      })
      await this.em.flush()
    } catch (error: unknown) {
      // The unique constraints reject a concurrent callback's write that the checks above let through
      const constraint =
        error instanceof UniqueConstraintViolationException ? (error as { constraint?: string }).constraint : undefined
      if (constraint === GITHUB_ACCOUNT_UNIQUE_CONSTRAINT) {
        throw new ConflictException(ACCOUNT_LINKED_TO_ANOTHER_USER)
      }
      if (constraint === USER_UNIQUE_CONSTRAINT) {
        throw new ConflictException(CONCURRENT_LINK_FOR_USER)
      }
      throw error
    }
    this.logger.info(`GitHub account linked for user ${authInfo.userId}`)
    return { linked: true, githubUsername: githubUser.login }
  }

  /**
   * Removes the user's GitHub link: the binding, pending link attempts and open GPG challenges.
   * Idempotent; the audit event is written only when a binding existed.
   */
  public async unlinkGithub(authInfo: AuthInfo): Promise<void> {
    await this.em.nativeDelete(OAuthLinkAttempt, { user: authInfo.userId, status: LinkAttemptStatus.Pending })
    await this.em.nativeDelete(GpgChallenge, { user: authInfo.userId, consumed: false })

    const binding = await this.findBinding(authInfo.userId)
    if (!binding) return

    this.em.remove(binding)
    this.persistAudit({
      eventType: ContributorAuditEventType.BindingRemoved,
      userId: authInfo.userId,
      tenantId: authInfo.tenantId,
      githubAccountId: binding.githubAccountId,
      githubUsername: binding.githubUsername,
      walletId: authInfo.walletId,
      gpgFingerprint: binding.gpgFingerprint ?? undefined,
      metadata: { source: 'github-unlink' },
    })
    await this.em.flush()
    this.logger.info(`GitHub account unlinked for user ${authInfo.userId}`)
  }

  public async recordChallengeRequested(input: {
    userId: string
    tenantId: string
    githubAccountId: string
    githubUsername: string
    walletId: string
    challengeId: string
  }): Promise<void> {
    this.persistAudit({
      eventType: ContributorAuditEventType.ChallengeRequested,
      userId: input.userId,
      tenantId: input.tenantId,
      githubAccountId: input.githubAccountId,
      githubUsername: input.githubUsername,
      walletId: input.walletId,
      metadata: { challengeId: input.challengeId },
    })
    await this.em.flush()
  }

  /**
   * Stamps the user's binding with the verified key, if it still points at the GitHub account the
   * challenge was issued for (checked by the update itself, so a concurrent re-link wins). The wallet
   * and tenant are refreshed to those of the verifying request.
   */
  public async recordProofAccepted(input: {
    userId: string
    tenantId: string
    githubAccountId: string
    githubUsername: string
    walletId: string
    gpgFingerprint: string
    verifiedAt: Date
  }): Promise<ContributorBinding | undefined> {
    this.persistAudit({
      eventType: ContributorAuditEventType.ProofAccepted,
      userId: input.userId,
      tenantId: input.tenantId,
      githubAccountId: input.githubAccountId,
      githubUsername: input.githubUsername,
      walletId: input.walletId,
      gpgFingerprint: input.gpgFingerprint,
      metadata: { verifiedAt: input.verifiedAt.toISOString() },
    })

    const updated = await this.em.nativeUpdate(
      ContributorBinding,
      { user: input.userId, githubAccountId: input.githubAccountId },
      {
        gpgFingerprint: input.gpgFingerprint,
        verifiedAt: input.verifiedAt,
        tenantId: input.tenantId,
        walletId: input.walletId,
        updatedAt: new Date(),
      },
    )
    if (updated === 0) {
      await this.em.flush()
      return undefined
    }

    this.persistAudit({
      eventType: ContributorAuditEventType.BindingUpdated,
      userId: input.userId,
      tenantId: input.tenantId,
      githubAccountId: input.githubAccountId,
      githubUsername: input.githubUsername,
      walletId: input.walletId,
      gpgFingerprint: input.gpgFingerprint,
      metadata: { source: 'gpg-proof' },
    })
    await this.em.flush()
    this.logger.info(`GPG verification stored for user ${input.userId}`)
    return (await this.em.findOne(ContributorBinding, { user: input.userId }, { refresh: true })) ?? undefined
  }

  public async recordProofRejected(input: {
    userId: string
    tenantId: string
    githubAccountId: string
    githubUsername: string
    walletId: string
    challengeId: string
    reason: string
  }): Promise<void> {
    this.persistAudit({
      eventType: ContributorAuditEventType.ProofRejected,
      userId: input.userId,
      tenantId: input.tenantId,
      githubAccountId: input.githubAccountId,
      githubUsername: input.githubUsername,
      walletId: input.walletId,
      metadata: { challengeId: input.challengeId, reason: input.reason },
    })
    await this.em.flush()
  }

  private async findBinding(userId: string): Promise<ContributorBinding | null> {
    return this.em.findOne(ContributorBinding, { user: userId })
  }

  /**
   * Deletes attempts that expired more than one TTL ago. It runs before every new attempt, so each
   * call removes only the rows that crossed the cutoff since the previous one, and the table stays small.
   */
  private async purgeExpiredLinkAttempts(): Promise<void> {
    await this.em.nativeDelete(OAuthLinkAttempt, { expiresAt: { $lt: new Date(Date.now() - LINK_ATTEMPT_TTL_MS) } })
  }

  private sha256(value: string, encoding: 'hex' | 'base64url' = 'hex'): string {
    return crypto.createHash('sha256').update(value).digest(encoding)
  }

  private async exchangeCodeForToken(code: string, codeVerifier: string): Promise<string> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<{ access_token?: string; error?: string }>(
          this.github.tokenUrl,
          {
            client_id: this.github.clientId,
            client_secret: this.github.clientSecret,
            code,
            redirect_uri: this.github.callbackUrl,
            code_verifier: codeVerifier,
          },
          { headers: { Accept: 'application/json' }, timeout: this.github.requestTimeoutMs },
        ),
      )
      if (!response.data.access_token) {
        throw new BadGatewayException(`GitHub token exchange failed: ${response.data.error ?? 'unknown_error'}`)
      }
      return response.data.access_token
    } catch (error: unknown) {
      if (error instanceof BadGatewayException) {
        throw error
      }
      throw new ServiceUnavailableException('Unable to exchange GitHub OAuth code.')
    }
  }

  private async fetchGithubUser(accessToken: string): Promise<{ id: string; login: string }> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<{ id?: number | string; login?: string }>(this.github.userApiUrl, {
          headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${accessToken}` },
          timeout: this.github.requestTimeoutMs,
        }),
      )
      const id = response.data.id === undefined ? '' : String(response.data.id)
      if (!/^[0-9]+$/.test(id) || !response.data.login) {
        throw new BadGatewayException('GitHub identity response did not include a numeric account id and username.')
      }
      return { id, login: response.data.login }
    } catch (error: unknown) {
      if (error instanceof BadGatewayException) {
        throw error
      }
      if (axios.isAxiosError(error)) {
        throw new ServiceUnavailableException('Unable to retrieve authenticated GitHub identity.')
      }
      throw error
    }
  }

  /**
   * Best effort: a failed revocation is logged without failing the link. The token is never stored and
   * carries no scopes. GitHub requires basic auth with the OAuth app's credentials here.
   */
  private async revokeGithubToken(accessToken: string): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.delete(this.github.tokenRevocationUrl!, {
          auth: { username: this.github.clientId!, password: this.github.clientSecret! },
          data: { access_token: accessToken },
          headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'heka-identity-service' },
          timeout: this.github.requestTimeoutMs,
        }),
      )
    } catch (error: unknown) {
      // Only the message: the request config of an axios error carries the client secret and the token
      this.logger.warn(
        `GitHub access token could not be revoked: ${error instanceof Error ? error.message : 'unknown error'}`,
      )
    }
  }

  private persistAudit(input: AuditInput): void {
    const event = new ContributorAuditEvent()
    event.eventType = input.eventType
    event.userId = input.userId
    event.tenantId = input.tenantId
    event.githubAccountId = input.githubAccountId
    event.githubUsername = input.githubUsername
    event.walletId = input.walletId
    event.gpgFingerprint = input.gpgFingerprint
    event.metadata = input.metadata
    this.em.persist(event)
  }
}
