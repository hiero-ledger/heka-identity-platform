import * as crypto from 'crypto'

import { EntityManager } from '@mikro-orm/core'
import { HttpService } from '@nestjs/axios'
import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import axios from 'axios'
import { firstValueFrom } from 'rxjs'

import { ConfigService } from '@config'

import { ContributorAuditEvent, ContributorAuditEventType } from './contributor-audit-event.entity'
import { ContributorBinding } from './contributor-binding.entity'
import {
  type AuthInfo,
  ContributorOnboardingStatusDto,
  type GithubIdentity,
  toContributorAuditEventDto,
  toContributorBindingDto,
} from './contributor-onboarding.types'

interface GithubOAuthTokenResponse {
  access_token?: string
  error?: string
  error_description?: string
}

interface GithubUserResponse {
  id?: number | string
  login?: string
}

interface OAuthStatePayload {
  nonce: string
  redirectPath?: string
  exp: number
}

interface ContributorAuditInput {
  eventType: ContributorAuditEventType
  githubAccountId?: string
  githubUsername?: string
  walletId?: string
  gpgFingerprint?: string
  metadata?: Record<string, unknown>
}

/**
 * Derives the contributor wallet ID from the GitHub account ID.
 * Mirrors the `getWalletId({ role: Role.User, userId })` logic used in the
 * Identity Service so that both services produce the same stable identifier.
 */
function contributorWalletId(githubAccountId: string): string {
  return `User_github:${githubAccountId}`
}

@Injectable()
export class ContributorOnboardingService {
  private readonly logger = new Logger(ContributorOnboardingService.name)

  public constructor(
    private readonly em: EntityManager,
    private readonly httpService: HttpService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  public createGithubAuthorizationUrl(redirectPath?: string): { authorizationUrl: string; state: string } {
    this.assertGithubOAuthConfigured()

    const state = this.signOAuthState({
      nonce: crypto.randomBytes(16).toString('hex'),
      redirectPath,
      exp: Math.floor(Date.now() / 1000) + this.configService.githubConfig.oauthStateTtlSeconds,
    })

    const url = new URL(this.configService.githubConfig.oauthAuthorizeUrl)
    url.searchParams.set('client_id', this.configService.githubConfig.oauthClientId!)
    url.searchParams.set('redirect_uri', this.configService.githubConfig.oauthRedirectUri!)
    url.searchParams.set('scope', 'read:user')
    url.searchParams.set('state', state)

    return { authorizationUrl: url.toString(), state }
  }

  public async loginWithGithubOAuth(
    code: string,
    state: string,
  ): Promise<{
    access: string
    refresh: null
    github: GithubIdentity
    binding: ReturnType<typeof toContributorBindingDto>
    redirectPath?: string
  }> {
    this.assertGithubOAuthConfigured()
    const statePayload = this.verifyOAuthState(state)
    const githubAccessToken = await this.exchangeCodeForToken(code)
    const githubIdentity = await this.fetchAuthenticatedGithubIdentity(githubAccessToken)

    // Derive the stable wallet ID inline — mirrors getWalletId({ role: Role.User, userId })
    // from the Identity Service without pulling in the Credo AuthService.
    const walletId = contributorWalletId(githubIdentity.accountId)

    const tokenPayload = {
      sub: `github:${githubIdentity.accountId}`,
      name: githubIdentity.username,
      walletId,
    }

    const em = this.em.fork()
    const binding = await this.upsertGithubBinding(em, {
      githubAccountId: githubIdentity.accountId,
      githubUsername: githubIdentity.username,
      walletId,
    })

    const access = await this.jwtService.signAsync(tokenPayload, {
      issuer: this.configService.jwtConfig.issuer as string | undefined,
      audience: this.configService.jwtConfig.audience as string | undefined,
    })

    return {
      access,
      refresh: null,
      github: githubIdentity,
      binding: toContributorBindingDto(binding),
      redirectPath: statePayload.redirectPath,
    }
  }

  public async getStatus(authInfo: AuthInfo): Promise<ContributorOnboardingStatusDto> {
    const em = this.em.fork()
    const binding = await em.findOne(ContributorBinding, { walletId: authInfo.walletId })
    const auditEvents = await em.find(
      ContributorAuditEvent,
      { walletId: authInfo.walletId },
      { orderBy: { createdAt: 'DESC' }, limit: 20 },
    )

    return {
      github: binding
        ? {
            accountId: binding.githubAccountId,
            username: binding.githubUsername,
          }
        : undefined,
      binding: binding ? toContributorBindingDto(binding) : undefined,
      verificationStatus: binding?.verifiedAt ? 'GpgVerified' : binding ? 'GitHubConnected' : 'NotConnected',
      auditEvents: auditEvents.map(toContributorAuditEventDto),
    }
  }

  public async getRequiredBindingForWallet(walletId: string): Promise<ContributorBinding> {
    const em = this.em.fork()
    const binding = await em.findOne(ContributorBinding, { walletId })

    if (!binding) {
      throw new UnauthorizedException('GitHub login is required before requesting contributor verification.')
    }

    return binding
  }

  public async getPublicGithubIdentityByUsername(githubUsername: string): Promise<GithubIdentity> {
    const url = `${this.configService.githubConfig.usersApiUrl}/${encodeURIComponent(githubUsername)}`

    try {
      const response = await firstValueFrom(
        this.httpService.get<GithubUserResponse>(url, { timeout: this.configService.githubConfig.requestTimeoutMs }),
      )
      return this.toGithubIdentity(response.data)
    } catch (error: unknown) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        throw new BadRequestException(`GitHub user '${githubUsername}' was not found.`)
      }

      throw new ServiceUnavailableException('Unable to retrieve contributor GitHub identity.')
    }
  }

  public async recordChallengeRequested(input: {
    githubAccountId?: string
    githubUsername: string
    walletId?: string
    challengeId: string
  }): Promise<void> {
    const em = this.em.fork()
    this.recordAuditEvent(em, {
      eventType: ContributorAuditEventType.ChallengeRequested,
      githubAccountId: input.githubAccountId,
      githubUsername: input.githubUsername,
      walletId: input.walletId,
      metadata: { challengeId: input.challengeId },
    })
    await em.flush()
  }

  public async recordProofAccepted(input: {
    githubAccountId?: string
    githubUsername: string
    walletId?: string
    gpgFingerprint: string
    verifiedAt: Date
  }): Promise<ContributorBinding | undefined> {
    const em = this.em.fork()
    this.recordAuditEvent(em, {
      eventType: ContributorAuditEventType.ProofAccepted,
      githubAccountId: input.githubAccountId,
      githubUsername: input.githubUsername,
      walletId: input.walletId,
      gpgFingerprint: input.gpgFingerprint,
      metadata: { verifiedAt: input.verifiedAt.toISOString() },
    })

    if (!input.githubAccountId || !input.walletId) {
      await em.flush()
      return undefined
    }

    return this.updateVerifiedBinding(em, {
      githubAccountId: input.githubAccountId,
      githubUsername: input.githubUsername,
      walletId: input.walletId,
      gpgFingerprint: input.gpgFingerprint,
      verifiedAt: input.verifiedAt,
    })
  }

  public async recordProofRejected(input: {
    githubAccountId?: string
    githubUsername: string
    walletId?: string
    challengeId: string
    reason: string
  }): Promise<void> {
    const em = this.em.fork()
    this.recordAuditEvent(em, {
      eventType: ContributorAuditEventType.ProofRejected,
      githubAccountId: input.githubAccountId,
      githubUsername: input.githubUsername,
      walletId: input.walletId,
      metadata: { challengeId: input.challengeId, reason: input.reason },
    })
    await em.flush()
  }

  private async upsertGithubBinding(
    em: EntityManager,
    input: {
      githubAccountId: string
      githubUsername: string
      walletId: string
    },
  ): Promise<ContributorBinding> {
    let binding = await em.findOne(ContributorBinding, {
      $or: [{ githubAccountId: input.githubAccountId }, { walletId: input.walletId }],
    })

    if (!binding) {
      binding = new ContributorBinding(input)
      em.persist(binding)
    } else {
      binding.githubAccountId = input.githubAccountId
      binding.githubUsername = input.githubUsername
      binding.walletId = input.walletId
    }

    this.recordAuditEvent(em, {
      eventType: ContributorAuditEventType.BindingUpdated,
      githubAccountId: binding.githubAccountId,
      githubUsername: binding.githubUsername,
      walletId: binding.walletId,
      metadata: { source: 'github-oauth' },
    })
    await em.flush()
    this.logger.log(`Contributor binding updated (id: ${binding.id})`)

    return binding
  }

  private async updateVerifiedBinding(
    em: EntityManager,
    input: {
      githubAccountId: string
      githubUsername: string
      walletId: string
      gpgFingerprint: string
      verifiedAt: Date
    },
  ): Promise<ContributorBinding> {
    let binding = await em.findOne(ContributorBinding, {
      $or: [{ githubAccountId: input.githubAccountId }, { walletId: input.walletId }],
    })

    if (!binding) {
      binding = new ContributorBinding(input)
      em.persist(binding)
    }

    binding.githubAccountId = input.githubAccountId
    binding.githubUsername = input.githubUsername
    binding.walletId = input.walletId
    binding.gpgFingerprint = input.gpgFingerprint
    binding.verifiedAt = input.verifiedAt

    this.recordAuditEvent(em, {
      eventType: ContributorAuditEventType.BindingUpdated,
      githubAccountId: binding.githubAccountId,
      githubUsername: binding.githubUsername,
      walletId: binding.walletId,
      gpgFingerprint: binding.gpgFingerprint,
      metadata: { source: 'gpg-proof' },
    })
    await em.flush()

    return binding
  }

  private recordAuditEvent(em: EntityManager, input: ContributorAuditInput): void {
    em.persist(new ContributorAuditEvent(input))
  }

  private async exchangeCodeForToken(code: string): Promise<string> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<GithubOAuthTokenResponse>(
          this.configService.githubConfig.oauthTokenUrl,
          {
            client_id: this.configService.githubConfig.oauthClientId,
            client_secret: this.configService.githubConfig.oauthClientSecret,
            code,
            redirect_uri: this.configService.githubConfig.oauthRedirectUri,
          },
          {
            headers: { Accept: 'application/json' },
            timeout: this.configService.githubConfig.requestTimeoutMs,
          },
        ),
      )

      if (!response.data.access_token) {
        throw new BadRequestException(response.data.error_description ?? response.data.error ?? 'GitHub OAuth failed.')
      }

      return response.data.access_token
    } catch (error: unknown) {
      if (error instanceof BadRequestException) {
        throw error
      }

      throw new ServiceUnavailableException('Unable to exchange GitHub OAuth code.')
    }
  }

  private async fetchAuthenticatedGithubIdentity(accessToken: string): Promise<GithubIdentity> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<GithubUserResponse>(this.configService.githubConfig.userApiUrl, {
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${accessToken}`,
          },
          timeout: this.configService.githubConfig.requestTimeoutMs,
        }),
      )
      return this.toGithubIdentity(response.data)
    } catch (error: unknown) {
      // Rethrow HTTP exceptions (e.g. BadRequestException from toGithubIdentity when
      // GitHub returns a payload without id/login) — do not collapse them into 503.
      if (error instanceof HttpException) {
        throw error
      }
      this.logger.warn(`GitHub user API request failed: ${error instanceof Error ? error.message : 'unknown error'}`)
      throw new ServiceUnavailableException('Unable to retrieve authenticated GitHub identity.')
    }
  }

  private toGithubIdentity(data: GithubUserResponse): GithubIdentity {
    if (!data.id || !data.login) {
      throw new BadRequestException('GitHub identity response did not include account id and username.')
    }

    return {
      accountId: String(data.id),
      username: data.login,
    }
  }

  private signOAuthState(payload: OAuthStatePayload): string {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
    const signature = crypto.createHmac('sha256', this.configService.githubConfig.oauthStateSecret).update(body).digest('base64url')

    return `${body}.${signature}`
  }

  private verifyOAuthState(state: string): OAuthStatePayload {
    const [body, signature] = state.split('.')

    if (!body || !signature) {
      throw new BadRequestException('Invalid GitHub OAuth state.')
    }

    const expectedSignature = crypto
      .createHmac('sha256', this.configService.githubConfig.oauthStateSecret)
      .update(body)
      .digest('base64url')

    if (
      signature.length !== expectedSignature.length ||
      !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
    ) {
      throw new BadRequestException('Invalid GitHub OAuth state signature.')
    }

    let payload: OAuthStatePayload
    try {
      payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as OAuthStatePayload
    } catch {
      throw new BadRequestException('Invalid GitHub OAuth state payload.')
    }

    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      throw new BadRequestException('GitHub OAuth state has expired.')
    }

    return payload
  }

  private assertGithubOAuthConfigured(): void {
    if (
      !this.configService.githubConfig.oauthClientId ||
      !this.configService.githubConfig.oauthClientSecret ||
      !this.configService.githubConfig.oauthRedirectUri
    ) {
      throw new ServiceUnavailableException('GitHub OAuth is not configured.')
    }
  }
}
