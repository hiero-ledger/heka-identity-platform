import * as crypto from 'crypto'

import { createMock } from '@golevelup/ts-vitest'
import { EntityManager, UniqueConstraintViolationException } from '@mikro-orm/core'
import { HttpService } from '@nestjs/axios'
import { BadGatewayException, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { of, throwError } from 'rxjs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthInfo, Role } from 'common/auth'
import { User } from 'common/entities'
import { Logger } from 'common/logger'
import { GithubConfig } from 'config/github'
import { GpgChallenge } from 'gpg-challenge/gpg-challenge.entity'

import { ContributorAuditEventType } from '../contributor-audit-event.entity'
import { ContributorBinding } from '../contributor-binding.entity'
import { ContributorOnboardingService } from '../contributor-onboarding.service'
import { LinkAttemptStatus, OAuthLinkAttempt } from '../oauth-link-attempt.entity'

const githubConfig: GithubConfig = {
  enabled: true,
  clientId: 'client-id',
  clientSecret: 'client-secret',
  callbackUrl: 'http://localhost:3000/github/callback',
  authorizeUrl: 'https://github.com/login/oauth/authorize',
  tokenUrl: 'https://github.com/login/oauth/access_token',
  userApiUrl: 'https://api.github.com/user',
  tokenRevocationUrl: 'https://api.github.com/applications/client-id/token',
  gpgKeyBaseUrl: 'https://github.com',
  requestTimeoutMs: 8000,
}

const FIVE_MINUTES_MS = 5 * 60 * 1000

function auth(overrides: Partial<AuthInfo> = {}): AuthInfo {
  return {
    userId: 'user-1',
    user: {} as User,
    userName: 'ada',
    role: Role.User,
    walletId: 'User_user-1',
    tenantId: 'tenant-1',
    ...overrides,
  }
}

/** The same OIDC subject after a role change: another wallet and tenant. */
const asAdmin = () => auth({ role: Role.Admin, walletId: 'Administration', tenantId: 'tenant-admin' })

function binding(overrides: Partial<ContributorBinding> = {}): ContributorBinding {
  const row = new ContributorBinding()
  row.userId = 'user-1'
  row.tenantId = 'tenant-1'
  row.walletId = 'User_user-1'
  row.githubAccountId = '4115704'
  row.githubUsername = 'octocat'
  row.linkedAt = new Date('2026-10-01T00:00:00Z')
  row.updatedAt = new Date('2026-10-01T00:00:00Z')
  return Object.assign(row, overrides)
}

function pendingAttempt(overrides: Partial<OAuthLinkAttempt> = {}): OAuthLinkAttempt {
  const attempt = new OAuthLinkAttempt()
  attempt.userId = 'user-1'
  attempt.tenantId = 'tenant-1'
  attempt.walletId = 'User_user-1'
  attempt.stateHash = crypto.createHash('sha256').update('state').digest('hex')
  attempt.codeVerifier = 'server-verifier'
  attempt.expiresAt = new Date(Date.now() + FIVE_MINUTES_MS)
  return Object.assign(attempt, overrides)
}

describe('ContributorOnboardingService', () => {
  let service: ContributorOnboardingService
  let logger: Logger
  let em: {
    findOne: ReturnType<typeof vi.fn>
    find: ReturnType<typeof vi.fn>
    persist: ReturnType<typeof vi.fn>
    remove: ReturnType<typeof vi.fn>
    flush: ReturnType<typeof vi.fn>
    nativeUpdate: ReturnType<typeof vi.fn>
    nativeDelete: ReturnType<typeof vi.fn>
  }
  let http: { post: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> }

  /** Routes `em.findOne` by entity: the link attempt, the binding by OIDC subject, the binding by GitHub account. */
  function rows({
    attempt = null,
    bySubject = null,
    byAccount = null,
  }: {
    attempt?: OAuthLinkAttempt | null
    bySubject?: ContributorBinding | null
    byAccount?: ContributorBinding | null
  }) {
    em.findOne.mockImplementation((entity: unknown, where: Record<string, unknown>) => {
      if (entity === OAuthLinkAttempt) return attempt
      if (entity === ContributorBinding) return 'githubAccountId' in where ? byAccount : bySubject
      return null
    })
  }

  /** GitHub answers the code exchange with a token and the identity of that token's user. */
  function github(user: { id: number; login: string } = { id: 4115704, login: 'octocat' }) {
    http.post.mockReturnValue(of({ data: { access_token: 'gho_token' } }))
    http.get.mockReturnValue(of({ data: user }))
  }

  beforeEach(() => {
    em = {
      findOne: vi.fn().mockResolvedValue(null),
      find: vi.fn().mockResolvedValue([]),
      persist: vi.fn(),
      remove: vi.fn(),
      flush: vi.fn().mockResolvedValue(undefined),
      nativeUpdate: vi.fn().mockResolvedValue(1),
      nativeDelete: vi.fn().mockResolvedValue(0),
    }
    http = { post: vi.fn(), get: vi.fn(), delete: vi.fn().mockReturnValue(of({ status: 204 })) }
    logger = createMock<Logger>()
    service = new ContributorOnboardingService(
      em as unknown as EntityManager,
      http as unknown as HttpService,
      githubConfig,
      logger,
    )
  })

  it('asks to link GitHub first with 409, not 401', async () => {
    await expect(service.getRequiredBindingForUser(auth())).rejects.toThrow(ConflictException)
  })

  it('finds the binding by the OIDC subject, whatever the current role, wallet or tenant', async () => {
    const row = binding()
    rows({ bySubject: row })

    await expect(service.getRequiredBindingForUser(asAdmin())).resolves.toBe(row)
    expect(em.findOne).toHaveBeenCalledWith(ContributorBinding, { userId: 'user-1' })
  })

  it('returns not-connected status when the user has no binding', async () => {
    await expect(service.getStatus(auth())).resolves.toMatchObject({
      verificationStatus: 'NotConnected',
      binding: undefined,
    })
  })

  it('returns GitHubConnected before GPG verification, also after a role change', async () => {
    rows({ bySubject: binding() })

    for (const caller of [auth(), asAdmin()]) {
      await expect(service.getStatus(caller)).resolves.toMatchObject({
        verificationStatus: 'GitHubConnected',
        github: { accountId: '4115704', username: 'octocat' },
      })
    }
    expect(em.find).toHaveBeenCalledWith(expect.anything(), { userId: 'user-1' }, expect.anything())
  })

  it('throws when credential issuance asks for a missing binding', async () => {
    await expect(service.getVerifiedBindingByUser('user-1')).rejects.toThrow(NotFoundException)
  })

  it('throws when the binding is not GPG-verified', async () => {
    rows({ bySubject: binding() })
    await expect(service.getVerifiedBindingByUser('user-1')).rejects.toThrow(ConflictException)
  })

  it('returns the stored GitHub account for a verified binding, without a wallet id', async () => {
    const verifiedAt = new Date('2026-10-02T00:00:00Z')
    rows({ bySubject: binding({ gpgFingerprint: 'AABB', verifiedAt }) })

    await expect(service.getVerifiedBindingByUser('user-1')).resolves.toEqual({
      githubAccountId: '4115704',
      githubUsername: 'octocat',
      gpgFingerprint: 'AABB',
      verifiedAt: verifiedAt.toISOString(),
    })
  })

  it('stamps the binding when the proof matches its GitHub account, and refreshes wallet and tenant', async () => {
    const row = binding()
    rows({ bySubject: row })
    const verifiedAt = new Date('2026-10-03T00:00:00Z')

    const updated = await service.recordProofAccepted({
      userId: 'user-1',
      tenantId: 'tenant-admin',
      githubAccountId: '4115704',
      githubUsername: 'octocat',
      walletId: 'Administration',
      gpgFingerprint: 'FF00',
      verifiedAt,
    })

    expect(updated).toMatchObject({
      gpgFingerprint: 'FF00',
      verifiedAt,
      walletId: 'Administration',
      tenantId: 'tenant-admin',
    })
    expect(em.persist).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: ContributorAuditEventType.ProofAccepted }),
    )
  })

  it('does not stamp a binding for a different GitHub account', async () => {
    rows({ bySubject: binding({ githubAccountId: '999' }) })

    const updated = await service.recordProofAccepted({
      userId: 'user-1',
      tenantId: 'tenant-1',
      githubAccountId: '4115704',
      githubUsername: 'octocat',
      walletId: 'User_user-1',
      gpgFingerprint: 'FF00',
      verifiedAt: new Date(),
    })

    expect(updated).toBeUndefined()
  })

  describe('GitHub account linking', () => {
    it('stores only the state hash, sends PKCE and the callback URL, and asks for no scopes', async () => {
      let attempt: OAuthLinkAttempt | undefined
      em.persist.mockImplementation((row: OAuthLinkAttempt) => {
        attempt = row
      })

      const { authorizationUrl } = await service.createGithubLinkRequest(auth())
      const url = new URL(authorizationUrl)

      expect(attempt).toBeDefined()
      expect(attempt!.stateHash).toBe(crypto.createHash('sha256').update(url.searchParams.get('state')!).digest('hex'))
      expect(attempt!.stateHash).not.toBe(url.searchParams.get('state'))
      expect(url.searchParams.get('redirect_uri')).toBe(githubConfig.callbackUrl)
      expect(url.searchParams.get('code_challenge_method')).toBe('S256')
      expect(url.searchParams.get('code_challenge')).toBe(
        crypto.createHash('sha256').update(attempt!.codeVerifier!).digest('base64url'),
      )
      expect(url.searchParams.get('client_secret')).toBeNull()
      expect(url.searchParams.has('scope')).toBe(false)
      expect(attempt!.expiresAt.getTime()).toBeGreaterThan(Date.now() + 4 * 60 * 1000)
    })

    it('purges link attempts that expired more than one TTL ago before creating one', async () => {
      const before = Date.now()

      await service.createGithubLinkRequest(auth())

      expect(em.nativeDelete).toHaveBeenCalledWith(OAuthLinkAttempt, { expiresAt: { $lt: expect.any(Date) } })
      const cutoff = (em.nativeDelete.mock.calls[0][1] as { expiresAt: { $lt: Date } }).expiresAt.$lt.getTime()
      expect(cutoff).toBeGreaterThanOrEqual(before - FIVE_MINUTES_MS)
      expect(cutoff).toBeLessThanOrEqual(Date.now() - FIVE_MINUTES_MS)
      expect(em.nativeDelete.mock.invocationCallOrder[0]).toBeLessThan(em.persist.mock.invocationCallOrder[0])
    })

    it('accepts the state only for the user, wallet and tenant that started it, while pending and unexpired', async () => {
      const before = Date.now()

      await expect(service.completeGithubLink(auth(), 'code', 'state')).rejects.toThrow(BadRequestException)

      expect(em.findOne).toHaveBeenCalledWith(OAuthLinkAttempt, {
        stateHash: crypto.createHash('sha256').update('state').digest('hex'),
        userId: 'user-1',
        tenantId: 'tenant-1',
        walletId: 'User_user-1',
        status: LinkAttemptStatus.Pending,
        expiresAt: { $gt: expect.any(Date) },
      })
      const notExpiredAfter = (em.findOne.mock.calls[0][1] as { expiresAt: { $gt: Date } }).expiresAt.$gt.getTime()
      expect(notExpiredAfter).toBeGreaterThanOrEqual(before)
      expect(notExpiredAfter).toBeLessThanOrEqual(Date.now())
      expect(em.nativeUpdate).not.toHaveBeenCalled()
      expect(http.post).not.toHaveBeenCalled()
    })

    it('consumes the state once and clears the PKCE verifier with it', async () => {
      const attempt = pendingAttempt()
      rows({ attempt })
      github()

      await service.completeGithubLink(auth(), 'code', 'state')

      expect(em.nativeUpdate).toHaveBeenCalledWith(
        OAuthLinkAttempt,
        { id: attempt.id, status: LinkAttemptStatus.Pending },
        { status: LinkAttemptStatus.Consumed, codeVerifier: null },
      )
    })

    it('rejects a state that a concurrent callback consumed first, with 400', async () => {
      rows({ attempt: pendingAttempt() })
      em.nativeUpdate.mockResolvedValue(0)

      await expect(service.completeGithubLink(auth(), 'code', 'state')).rejects.toThrow(BadRequestException)
      expect(http.post).not.toHaveBeenCalled()
    })

    it('rejects a GitHub account already linked to another OIDC subject', async () => {
      rows({ attempt: pendingAttempt(), byAccount: binding({ userId: 'user-2', tenantId: 'tenant-2' }) })
      github()

      await expect(service.completeGithubLink(auth(), 'code', 'state')).rejects.toThrow(ConflictException)
    })

    describe('a concurrent callback that wrote first (unique constraint)', () => {
      const uniqueViolation = (constraint: string) =>
        new UniqueConstraintViolationException(
          Object.assign(new Error(`duplicate key value violates unique constraint "${constraint}"`), {
            code: '23505',
            constraint,
          }),
        )

      it.each([
        ['contributor_binding_github_account_id_unique', /already linked to another Heka user/],
        ['contributor_binding_user_id_unique', /linked a GitHub account to this Heka user at the same time/],
      ])('%s answers 409; the state stays consumed and the token revoked', async (constraint, message) => {
        rows({ attempt: pendingAttempt() })
        github()
        em.flush.mockRejectedValue(uniqueViolation(constraint))

        const error = await service.completeGithubLink(auth(), 'code', 'state').catch((e: unknown) => e)

        expect(error).toBeInstanceOf(ConflictException)
        expect((error as ConflictException).message).toMatch(message)
        expect(em.nativeUpdate).toHaveBeenCalledOnce()
        expect(http.delete).toHaveBeenCalledOnce()
      })

      it('passes other database errors through', async () => {
        rows({ attempt: pendingAttempt() })
        github()
        const other = uniqueViolation('contributor_audit_event_pkey')
        em.flush.mockRejectedValue(other)

        await expect(service.completeGithubLink(auth(), 'code', 'state')).rejects.toBe(other)
      })
    })

    it('lets the same subject link the same account again after a role change, keeping the verification', async () => {
      const verifiedAt = new Date('2026-01-01T00:00:00Z')
      const row = binding({ gpgFingerprint: 'AABB', verifiedAt })
      rows({
        attempt: pendingAttempt({ walletId: 'Administration', tenantId: 'tenant-admin' }),
        bySubject: row,
        byAccount: row,
      })
      github()

      await expect(service.completeGithubLink(asAdmin(), 'code', 'state')).resolves.toEqual({
        linked: true,
        githubUsername: 'octocat',
      })

      expect(row).toMatchObject({
        walletId: 'Administration',
        tenantId: 'tenant-admin',
        gpgFingerprint: 'AABB',
        verifiedAt,
      })
      expect(em.persist).not.toHaveBeenCalledWith(expect.any(ContributorBinding))
    })

    it('resets GPG verification when the linked GitHub account changes', async () => {
      const row = binding({ gpgFingerprint: 'AABB', verifiedAt: new Date('2026-01-01T00:00:00Z') })
      rows({ attempt: pendingAttempt(), bySubject: row })
      github({ id: 999, login: 'other' })

      const result = await service.completeGithubLink(auth(), 'code', 'state')

      expect(result).toEqual({ linked: true, githubUsername: 'other' })
      expect(row.githubAccountId).toBe('999')
      expect(row.gpgFingerprint).toBeNull()
      expect(row.verifiedAt).toBeNull()
      expect(row.walletId).toBe('User_user-1')
    })

    it('sends the same redirect_uri and the stored verifier to GitHub', async () => {
      rows({ attempt: pendingAttempt() })
      github()

      await service.completeGithubLink(auth(), 'auth-code', 'state')

      expect(http.post).toHaveBeenCalledWith(
        githubConfig.tokenUrl,
        expect.objectContaining({
          code: 'auth-code',
          redirect_uri: githubConfig.callbackUrl,
          code_verifier: 'server-verifier',
        }),
        expect.any(Object),
      )
    })

    it('answers 502, not 401, when GitHub refuses the code', async () => {
      rows({ attempt: pendingAttempt() })
      http.post.mockReturnValue(of({ data: { error: 'bad_verification_code' } }))

      await expect(service.completeGithubLink(auth(), 'code', 'state')).rejects.toThrow(BadGatewayException)
    })

    it('answers 502, not 401, when GitHub returns no usable identity', async () => {
      rows({ attempt: pendingAttempt() })
      github({ id: undefined as unknown as number, login: 'octocat' })

      await expect(service.completeGithubLink(auth(), 'code', 'state')).rejects.toThrow(BadGatewayException)
    })

    it('revokes the GitHub token with the OAuth app credentials once the identity is read', async () => {
      rows({ attempt: pendingAttempt() })
      github()

      await service.completeGithubLink(auth(), 'code', 'state')

      expect(http.delete).toHaveBeenCalledWith(
        githubConfig.tokenRevocationUrl,
        expect.objectContaining({
          auth: { username: 'client-id', password: 'client-secret' },
          data: { access_token: 'gho_token' },
        }),
      )
      expect(http.delete.mock.invocationCallOrder[0]).toBeGreaterThan(http.get.mock.invocationCallOrder[0])
    })

    it('revokes the token also when the identity request fails', async () => {
      rows({ attempt: pendingAttempt() })
      github({ id: undefined as unknown as number, login: 'octocat' })

      await expect(service.completeGithubLink(auth(), 'code', 'state')).rejects.toThrow(BadGatewayException)
      expect(http.delete).toHaveBeenCalledOnce()
    })

    it('still links when the revocation fails, and logs it without the token or secret', async () => {
      rows({ attempt: pendingAttempt() })
      github()
      http.delete.mockReturnValue(throwError(() => new Error('Request failed with status code 422')))

      await expect(service.completeGithubLink(auth(), 'code', 'state')).resolves.toMatchObject({ linked: true })
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('status code 422'))
      expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toMatch(/gho_token|client-secret/)
    })
  })

  describe('unlinking', () => {
    it('removes the binding, pending link attempts and open challenges, and records it', async () => {
      const row = binding({ gpgFingerprint: 'AABB', verifiedAt: new Date() })
      rows({ bySubject: row })

      await service.unlinkGithub(asAdmin())

      expect(em.nativeDelete).toHaveBeenCalledWith(OAuthLinkAttempt, {
        userId: 'user-1',
        status: LinkAttemptStatus.Pending,
      })
      expect(em.nativeDelete).toHaveBeenCalledWith(GpgChallenge, { userId: 'user-1', consumed: false })
      expect(em.remove).toHaveBeenCalledWith(row)
      expect(em.persist).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: ContributorAuditEventType.BindingRemoved,
          userId: 'user-1',
          githubAccountId: '4115704',
          gpgFingerprint: 'AABB',
        }),
      )
      expect(em.flush).toHaveBeenCalled()
    })

    it('is idempotent: without a binding it only cleans up', async () => {
      await expect(service.unlinkGithub(auth())).resolves.toBeUndefined()

      expect(em.nativeDelete).toHaveBeenCalledTimes(2)
      expect(em.remove).not.toHaveBeenCalled()
      expect(em.persist).not.toHaveBeenCalled()
    })
  })
})
