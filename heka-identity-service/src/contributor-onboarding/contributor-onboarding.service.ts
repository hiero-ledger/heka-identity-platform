import * as crypto from 'crypto'

import { EntityManager } from '@mikro-orm/core'
import { HttpService } from '@nestjs/axios'
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigType } from '@nestjs/config'
import axios from 'axios'
import { firstValueFrom } from 'rxjs'

import { AuthInfo } from 'common/auth'
import GithubConfig from 'config/github'

import { ContributorAuditEvent, ContributorAuditEventType } from './contributor-audit-event.entity'
import { ContributorBinding } from './contributor-binding.entity'
import {
  ContributorOnboardingStatus,
  VerifiedContributor,
  toContributorAuditEventView,
  toContributorBindingView,
} from './contributor-onboarding.types'
import { LinkAttemptStatus, OAuthLinkAttempt } from './oauth-link-attempt.entity'

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

@Injectable()
export class ContributorOnboardingService {
  private readonly logger = new Logger(ContributorOnboardingService.name)

  public constructor(
    private readonly em: EntityManager,
    private readonly httpService: HttpService,
    @Inject(GithubConfig.KEY) private readonly github: ConfigType<typeof GithubConfig>,
  ) {}

  public async getStatus(authInfo: AuthInfo): Promise<ContributorOnboardingStatus> {
    const binding = await this.findBinding(authInfo.tenantId, authInfo.userId)
    if (binding) {
      this.assertWallet(binding, authInfo.walletId)
    }

    const auditEvents = await this.em.find(
      ContributorAuditEvent,
      { tenantId: authInfo.tenantId, userId: authInfo.userId },
      { orderBy: { createdAt: 'DESC' }, limit: 20 },
    )

    return {
      github: binding ? { accountId: binding.githubAccountId, username: binding.githubUsername } : undefined,
      binding: binding ? toContributorBindingView(binding) : undefined,
      verificationStatus: binding?.verifiedAt ? 'GpgVerified' : binding ? 'GitHubConnected' : 'NotConnected',
      auditEvents: auditEvents.map(toContributorAuditEventView),
    }
  }

  /**
   * Binding for the authenticated user. GitHub must already be linked.
   * A wallet mismatch is rejected so a copied user id cannot read another wallet.
   */
  public async getRequiredBindingForUser(authInfo: AuthInfo): Promise<ContributorBinding> {
    const binding = await this.findBinding(authInfo.tenantId, authInfo.userId)
    if (!binding) {
      throw new UnauthorizedException('Link a GitHub account before requesting contributor verification.')
    }
    this.assertWallet(binding, authInfo.walletId)
    return binding
  }

  /**
   * Verified binding for credential issuance.
   * The GitHub account id is read from this row, not from the request.
   */
  public async getVerifiedBindingByUser(
    tenantId: string,
    userId: string,
    walletId: string,
  ): Promise<VerifiedContributor> {
    const binding = await this.findBinding(tenantId, userId)
    if (!binding) {
      throw new NotFoundException('No contributor binding found for this user.')
    }
    this.assertWallet(binding, walletId)
    if (!binding.gpgFingerprint || !binding.verifiedAt) {
      throw new ConflictException(`Contributor @${binding.githubUsername} has not completed GPG verification.`)
    }

    return {
      githubAccountId: binding.githubAccountId,
      githubUsername: binding.githubUsername,
      gpgFingerprint: binding.gpgFingerprint,
      verifiedAt: binding.verifiedAt.toISOString(),
      walletId: binding.walletId,
    }
  }

  /** Starts a GitHub OAuth link. The raw state token is returned only inside the authorization URL. */
  public async createGithubLinkRequest(authInfo: AuthInfo): Promise<{ authorizationUrl: string }> {
    this.assertGithubOAuthConfigured()

    const stateToken = crypto.randomBytes(32).toString('hex')
    const codeVerifier = crypto.randomBytes(32).toString('base64url')
    const attempt = new OAuthLinkAttempt()
    attempt.userId = authInfo.userId
    attempt.walletId = authInfo.walletId
    attempt.tenantId = authInfo.tenantId
    attempt.stateHash = this.sha256(stateToken)
    attempt.codeVerifier = codeVerifier
    attempt.expiresAt = new Date(Date.now() + 5 * 60 * 1000)
    this.em.persist(attempt)
    await this.em.flush()

    const url = new URL(this.github.authorizeUrl)
    url.searchParams.set('client_id', this.github.clientId!)
    url.searchParams.set('redirect_uri', this.github.callbackUrl!)
    url.searchParams.set('state', stateToken)
    url.searchParams.set('scope', 'read:user read:gpg_key')
    url.searchParams.set('code_challenge', this.sha256(codeVerifier, 'base64url'))
    url.searchParams.set('code_challenge_method', 'S256')
    return { authorizationUrl: url.toString() }
  }

  /**
   * Exchanges the GitHub code for the user who started the link.
   * Does not issue a session. A different GitHub account clears GPG verification.
   */
  public async completeGithubLink(
    authInfo: AuthInfo,
    code: string,
    stateToken: string,
  ): Promise<{ linked: true; githubUsername: string }> {
    this.assertGithubOAuthConfigured()
    const stateHash = this.sha256(stateToken)
    const consumed = await this.em.nativeUpdate(
      OAuthLinkAttempt,
      {
        stateHash,
        userId: authInfo.userId,
        tenantId: authInfo.tenantId,
        walletId: authInfo.walletId,
        status: LinkAttemptStatus.Pending,
        expiresAt: { $gt: new Date() },
      },
      { status: LinkAttemptStatus.Consumed },
    )
    if (consumed === 0) {
      throw new UnauthorizedException('Invalid, expired, or already-consumed OAuth state')
    }

    const attempt = await this.em.findOneOrFail(OAuthLinkAttempt, {
      stateHash,
      userId: authInfo.userId,
      tenantId: authInfo.tenantId,
      walletId: authInfo.walletId,
    })

    const accessToken = await this.exchangeCodeForToken(code, attempt.codeVerifier)
    const githubUser = await this.fetchGithubUser(accessToken)

    const taken = await this.em.findOne(ContributorBinding, { githubAccountId: githubUser.id })
    if (taken && (taken.userId !== authInfo.userId || taken.tenantId !== authInfo.tenantId)) {
      throw new ConflictException('This GitHub account is already linked to another Heka user')
    }

    let binding = await this.findBinding(authInfo.tenantId, authInfo.userId)
    if (!binding) {
      binding = new ContributorBinding()
      binding.userId = authInfo.userId
      binding.tenantId = authInfo.tenantId
      binding.linkedAt = new Date()
      this.em.persist(binding)
    } else if (binding.githubAccountId !== githubUser.id) {
      binding.gpgFingerprint = null
      binding.verifiedAt = null
    }

    binding.walletId = attempt.walletId
    binding.githubAccountId = githubUser.id
    binding.githubUsername = githubUser.login
    this.persistAudit({
      eventType: ContributorAuditEventType.BindingUpdated,
      userId: authInfo.userId,
      tenantId: authInfo.tenantId,
      githubAccountId: githubUser.id,
      githubUsername: githubUser.login,
      walletId: attempt.walletId,
      metadata: { source: 'github-link' },
    })
    await this.em.flush()
    this.logger.log(`GitHub account linked for user ${authInfo.userId}`)
    return { linked: true, githubUsername: githubUser.login }
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

    const binding = await this.findBinding(input.tenantId, input.userId)
    if (!binding || binding.walletId !== input.walletId || binding.githubAccountId !== input.githubAccountId) {
      await this.em.flush()
      return undefined
    }

    binding.gpgFingerprint = input.gpgFingerprint
    binding.verifiedAt = input.verifiedAt
    this.persistAudit({
      eventType: ContributorAuditEventType.BindingUpdated,
      userId: input.userId,
      tenantId: input.tenantId,
      githubAccountId: binding.githubAccountId,
      githubUsername: binding.githubUsername,
      walletId: binding.walletId,
      gpgFingerprint: input.gpgFingerprint,
      metadata: { source: 'gpg-proof' },
    })
    await this.em.flush()
    this.logger.log(`GPG verification stored for user ${input.userId}`)
    return binding
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

  /** Current link for a GitHub account. Usernames are not stable, so callers resolve the numeric id first. */
  public findBindingByGithubAccountId(githubAccountId: string): Promise<ContributorBinding | null> {
    return this.em.findOne(ContributorBinding, { githubAccountId })
  }

  private async findBinding(tenantId: string, userId: string): Promise<ContributorBinding | null> {
    return this.em.findOne(ContributorBinding, { tenantId, userId })
  }

  private assertWallet(binding: ContributorBinding, walletId: string): void {
    if (binding.walletId !== walletId) {
      throw new ForbiddenException('Contributor binding does not belong to this wallet.')
    }
  }

  private assertGithubOAuthConfigured(): void {
    if (!this.github.clientId || !this.github.clientSecret || !this.github.callbackUrl) {
      throw new ServiceUnavailableException('GitHub OAuth is not configured.')
    }
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
        throw new UnauthorizedException(`GitHub token exchange failed: ${response.data.error ?? 'unknown_error'}`)
      }
      return response.data.access_token
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) {
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
        throw new UnauthorizedException('GitHub identity response did not include a numeric account id and username.')
      }
      return { id, login: response.data.login }
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) {
        throw error
      }
      if (axios.isAxiosError(error)) {
        throw new ServiceUnavailableException('Unable to retrieve authenticated GitHub identity.')
      }
      throw error
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
