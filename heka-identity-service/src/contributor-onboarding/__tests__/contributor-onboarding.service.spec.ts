import * as crypto from 'crypto'

import { EntityManager } from '@mikro-orm/core'
import { HttpService } from '@nestjs/axios'
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import { of } from 'rxjs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthInfo, Role } from 'common/auth'
import { User } from 'common/entities'

import { ContributorAuditEventType } from '../contributor-audit-event.entity'
import { ContributorBinding } from '../contributor-binding.entity'
import { ContributorOnboardingService } from '../contributor-onboarding.service'
import { LinkAttemptStatus, OAuthLinkAttempt } from '../oauth-link-attempt.entity'

const githubConfig = {
  clientId: 'client-id',
  clientSecret: 'client-secret',
  callbackUrl: 'http://localhost:3000/github/callback',
  authorizeUrl: 'https://github.com/login/oauth/authorize',
  tokenUrl: 'https://github.com/login/oauth/access_token',
  userApiUrl: 'https://api.github.com/user',
  gpgKeyBaseUrl: 'https://github.com',
  requestTimeoutMs: 8000,
  statusToken: undefined,
}

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

describe('ContributorOnboardingService', () => {
  let service: ContributorOnboardingService
  let em: {
    findOne: ReturnType<typeof vi.fn>
    find: ReturnType<typeof vi.fn>
    persist: ReturnType<typeof vi.fn>
    flush: ReturnType<typeof vi.fn>
    nativeUpdate: ReturnType<typeof vi.fn>
    findOneOrFail: ReturnType<typeof vi.fn>
  }
  let http: { post: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    em = {
      findOne: vi.fn(),
      find: vi.fn().mockResolvedValue([]),
      persist: vi.fn(),
      flush: vi.fn().mockResolvedValue(undefined),
      nativeUpdate: vi.fn(),
      findOneOrFail: vi.fn(),
    }
    http = { post: vi.fn(), get: vi.fn() }
    service = new ContributorOnboardingService(
      em as unknown as EntityManager,
      http as unknown as HttpService,
      githubConfig,
    )
  })

  it('requires a linked GitHub account before a challenge', async () => {
    em.findOne.mockResolvedValue(null)
    await expect(service.getRequiredBindingForUser(auth())).rejects.toThrow(UnauthorizedException)
  })

  it('rejects a binding stored for a different wallet', async () => {
    em.findOne.mockResolvedValue(binding({ walletId: 'User_other' }))
    await expect(service.getRequiredBindingForUser(auth())).rejects.toThrow(ForbiddenException)
  })

  it('returns not-connected status when the user has no binding', async () => {
    em.findOne.mockResolvedValue(null)
    await expect(service.getStatus(auth())).resolves.toMatchObject({
      verificationStatus: 'NotConnected',
      binding: undefined,
    })
  })

  it('returns GitHubConnected before GPG verification', async () => {
    em.findOne.mockResolvedValue(binding())
    await expect(service.getStatus(auth())).resolves.toMatchObject({
      verificationStatus: 'GitHubConnected',
      github: { accountId: '4115704', username: 'octocat' },
    })
  })

  it('throws when credential issuance asks for a missing binding', async () => {
    em.findOne.mockResolvedValue(null)
    await expect(service.getVerifiedBindingByUser('tenant-1', 'user-1', 'User_user-1')).rejects.toThrow(
      NotFoundException,
    )
  })

  it('throws when the binding is not GPG-verified', async () => {
    em.findOne.mockResolvedValue(binding())
    await expect(service.getVerifiedBindingByUser('tenant-1', 'user-1', 'User_user-1')).rejects.toThrow(
      ConflictException,
    )
  })

  it('returns the stored GitHub account id for a verified binding', async () => {
    const verifiedAt = new Date('2026-10-02T00:00:00Z')
    em.findOne.mockResolvedValue(binding({ gpgFingerprint: 'AABB', verifiedAt }))

    await expect(service.getVerifiedBindingByUser('tenant-1', 'user-1', 'User_user-1')).resolves.toEqual({
      githubAccountId: '4115704',
      githubUsername: 'octocat',
      gpgFingerprint: 'AABB',
      verifiedAt: verifiedAt.toISOString(),
      walletId: 'User_user-1',
    })
  })

  it('does not let user A read user B by passing a different wallet', async () => {
    em.findOne.mockResolvedValue(binding())
    await expect(service.getVerifiedBindingByUser('tenant-1', 'user-1', 'User_other')).rejects.toThrow(
      ForbiddenException,
    )
  })

  it('stamps the binding when the proof matches that user', async () => {
    const row = binding()
    em.findOne.mockResolvedValue(row)
    const verifiedAt = new Date('2026-10-03T00:00:00Z')

    const updated = await service.recordProofAccepted({
      userId: 'user-1',
      tenantId: 'tenant-1',
      githubAccountId: '4115704',
      githubUsername: 'octocat',
      walletId: 'User_user-1',
      gpgFingerprint: 'FF00',
      verifiedAt,
    })

    expect(updated?.gpgFingerprint).toBe('FF00')
    expect(updated?.verifiedAt).toEqual(verifiedAt)
    expect(em.persist).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: ContributorAuditEventType.ProofAccepted }),
    )
  })

  it('does not stamp a binding for a different GitHub account', async () => {
    em.findOne.mockResolvedValue(binding({ githubAccountId: '999' }))

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
    it('stores only the state hash and sends PKCE plus the callback URL', async () => {
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
        crypto.createHash('sha256').update(attempt!.codeVerifier).digest('base64url'),
      )
      expect(url.searchParams.get('client_secret')).toBeNull()
      expect(attempt!.expiresAt.getTime()).toBeGreaterThan(Date.now() + 4 * 60 * 1000)
    })

    it('consumes OAuth state only for the authenticated user and tenant', async () => {
      em.nativeUpdate.mockResolvedValue(0)
      await expect(service.completeGithubLink(auth(), 'code', 'state')).rejects.toThrow(UnauthorizedException)
      expect(em.nativeUpdate).toHaveBeenCalledWith(
        OAuthLinkAttempt,
        expect.objectContaining({
          userId: 'user-1',
          tenantId: 'tenant-1',
          walletId: 'User_user-1',
          status: LinkAttemptStatus.Pending,
        }),
        { status: LinkAttemptStatus.Consumed },
      )
      expect(http.post).not.toHaveBeenCalled()
    })

    it('rejects a GitHub account already linked to someone else', async () => {
      em.nativeUpdate.mockResolvedValue(1)
      em.findOneOrFail.mockResolvedValue({
        userId: 'user-1',
        tenantId: 'tenant-1',
        walletId: 'User_user-1',
        codeVerifier: 'verifier',
      })
      http.post.mockReturnValue(of({ data: { access_token: 'gho_token' } }))
      http.get.mockReturnValue(of({ data: { id: 4115704, login: 'octocat' } }))
      em.findOne.mockImplementation((entity: unknown, where: { githubAccountId?: string }) => {
        if (entity === ContributorBinding && where.githubAccountId) {
          return binding({ userId: 'user-2', tenantId: 'tenant-2' })
        }
        return null
      })

      await expect(service.completeGithubLink(auth(), 'code', 'state')).rejects.toThrow(ConflictException)
    })

    it('resets GPG verification when the linked GitHub account changes', async () => {
      const row = binding({ gpgFingerprint: 'AABB', verifiedAt: new Date('2026-01-01T00:00:00Z') })
      em.nativeUpdate.mockResolvedValue(1)
      em.findOneOrFail.mockResolvedValue({
        userId: 'user-1',
        tenantId: 'tenant-1',
        walletId: 'User_user-1',
        codeVerifier: 'verifier',
      })
      http.post.mockReturnValue(of({ data: { access_token: 'gho_token' } }))
      http.get.mockReturnValue(of({ data: { id: 999, login: 'other' } }))
      em.findOne.mockImplementation((_entity: unknown, where: { githubAccountId?: string; userId?: string }) => {
        if (where.githubAccountId) return null
        if (where.userId) return row
        return null
      })

      const result = await service.completeGithubLink(auth(), 'code', 'state')

      expect(result).toEqual({ linked: true, githubUsername: 'other' })
      expect(row.githubAccountId).toBe('999')
      expect(row.gpgFingerprint).toBeNull()
      expect(row.verifiedAt).toBeNull()
      expect(row.walletId).toBe('User_user-1')
    })

    it('keeps GPG verification when the same GitHub account is linked again', async () => {
      const verifiedAt = new Date('2026-01-01T00:00:00Z')
      const row = binding({ gpgFingerprint: 'AABB', verifiedAt })
      em.nativeUpdate.mockResolvedValue(1)
      em.findOneOrFail.mockResolvedValue({
        userId: 'user-1',
        tenantId: 'tenant-1',
        walletId: 'User_user-1',
        codeVerifier: 'verifier',
      })
      http.post.mockReturnValue(of({ data: { access_token: 'gho_token' } }))
      http.get.mockReturnValue(of({ data: { id: 4115704, login: 'octocat' } }))
      em.findOne.mockImplementation((_entity: unknown, where: { githubAccountId?: string; userId?: string }) => {
        if (where.userId) return row
        return row
      })

      await service.completeGithubLink(auth(), 'code', 'state')

      expect(row.gpgFingerprint).toBe('AABB')
      expect(row.verifiedAt).toEqual(verifiedAt)
    })

    it('sends the same redirect_uri and the stored verifier to GitHub', async () => {
      em.nativeUpdate.mockResolvedValue(1)
      em.findOneOrFail.mockResolvedValue({
        userId: 'user-1',
        tenantId: 'tenant-1',
        walletId: 'User_user-1',
        codeVerifier: 'server-verifier',
        status: LinkAttemptStatus.Consumed,
      })
      http.post.mockReturnValue(of({ data: { access_token: 'gho_token' } }))
      http.get.mockReturnValue(of({ data: { id: 4115704, login: 'octocat' } }))
      em.findOne.mockResolvedValue(null)

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

    it('refuses to start a link when GitHub OAuth is not configured', async () => {
      const unconfigured = new ContributorOnboardingService(
        em as unknown as EntityManager,
        http as unknown as HttpService,
        { ...githubConfig, clientId: undefined },
      )
      await expect(unconfigured.createGithubLinkRequest(auth())).rejects.toThrow(ServiceUnavailableException)
    })
  })
})
