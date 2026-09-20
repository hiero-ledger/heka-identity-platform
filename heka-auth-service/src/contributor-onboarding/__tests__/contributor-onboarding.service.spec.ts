import { EntityManager } from '@mikro-orm/core'
import { HttpService } from '@nestjs/axios'
import { JwtService } from '@nestjs/jwt'
import { of } from 'rxjs'

import { ConfigService } from '@config'

import { ContributorAuditEvent, ContributorAuditEventType } from '../contributor-audit-event.entity'
import { ContributorBinding } from '../contributor-binding.entity'
import { ContributorOnboardingService } from '../contributor-onboarding.service'

function createMock<T extends object>(overrides: Partial<T> = {}): T {
  return overrides as T
}

describe('ContributorOnboardingService', () => {
  let service: ContributorOnboardingService
  let rootEm: ReturnType<typeof createMock<EntityManager>>
  let em: ReturnType<typeof createMock<EntityManager>>
  let httpService: ReturnType<typeof createMock<HttpService>>
  let jwtService: ReturnType<typeof createMock<JwtService>>
  let configService: ReturnType<typeof createMock<ConfigService>>

  beforeEach(() => {
    em = createMock<EntityManager>({
      findOne: vi.fn(),
      find: vi.fn(),
      flush: vi.fn().mockResolvedValue(undefined),
      persist: vi.fn(),
    })
    rootEm = createMock<EntityManager>({
      fork: vi.fn().mockReturnValue(em),
    })
    httpService = createMock<HttpService>({
      get: vi.fn(),
      post: vi.fn(),
    })
    jwtService = createMock<JwtService>({
      signAsync: vi.fn().mockResolvedValue('signed-contributor-jwt'),
    })
    configService = createMock<ConfigService>({
      githubConfig: {
        oauthClientId: 'github-client-id',
        oauthClientSecret: 'github-client-secret',
        oauthRedirectUri: 'http://localhost:8000/contributor/github/callback',
        oauthAuthorizeUrl: 'https://github.com/login/oauth/authorize',
        oauthTokenUrl: 'https://github.com/login/oauth/access_token',
        oauthStateSecret: 'state-secret',
        oauthStateTtlSeconds: 600,
        userApiUrl: 'https://api.github.com/user',
        usersApiUrl: 'https://api.github.com/users',
        requestTimeoutMs: 5000,
      } as any,
      jwtConfig: {
        secret: 'jwt-secret',
        issuer: 'Heka',
        audience: 'Heka Identity Service',
      } as any,
    })

    service = new ContributorOnboardingService(rootEm, httpService, jwtService, configService)
  })

  it('completes GitHub OAuth and persists the contributor binding with a forked EntityManager', async () => {
    const { state } = service.createGithubAuthorizationUrl('/contributor/onboarding')

    vi.mocked(httpService.post).mockReturnValue(
      of({
        data: { access_token: 'github-access-token' },
      } as any),
    )
    vi.mocked(httpService.get).mockReturnValue(
      of({
        data: { id: 12345, login: 'octocat' },
      } as any),
    )
    vi.mocked(em.findOne).mockResolvedValue(null)

    const result = await service.loginWithGithubOAuth('github-code', state)

    expect(httpService.post).toHaveBeenCalledWith(
      'https://github.com/login/oauth/access_token',
      {
        client_id: 'github-client-id',
        client_secret: 'github-client-secret',
        code: 'github-code',
        redirect_uri: 'http://localhost:8000/contributor/github/callback',
      },
      {
        headers: { Accept: 'application/json' },
        timeout: 5000,
      },
    )
    expect(httpService.get).toHaveBeenCalledWith('https://api.github.com/user', {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: 'Bearer github-access-token',
      },
      timeout: 5000,
    })
    expect(rootEm.fork).toHaveBeenCalled()
    expect(em.findOne).toHaveBeenCalledWith(ContributorBinding, {
      $or: [{ githubAccountId: '12345' }, { walletId: 'User_github:12345' }],
    })
    expect(em.persist).toHaveBeenCalledWith(expect.any(ContributorBinding))
    expect(em.persist).toHaveBeenCalledWith(expect.any(ContributorAuditEvent))
    expect(em.flush).toHaveBeenCalledTimes(1)
    expect(jwtService.signAsync).toHaveBeenCalledWith(
      {
        sub: 'github:12345',
        name: 'octocat',
        walletId: 'User_github:12345',
      },
      {
        issuer: 'Heka',
        audience: 'Heka Identity Service',
      },
    )
    expect(result).toMatchObject({
      access: 'signed-contributor-jwt',
      refresh: null,
      github: {
        accountId: '12345',
        username: 'octocat',
      },
      binding: {
        githubAccountId: '12345',
        githubUsername: 'octocat',
        walletId: 'User_github:12345',
      },
      redirectPath: '/contributor/onboarding',
    })
  })

  it('reads contributor status through a forked EntityManager', async () => {
    const binding = new ContributorBinding({
      githubAccountId: '12345',
      githubUsername: 'octocat',
      walletId: 'User_github:12345',
      verifiedAt: new Date('2026-08-01T00:00:00.000Z'),
    })
    const auditEvent = new ContributorAuditEvent({
      eventType: ContributorAuditEventType.BindingUpdated,
      githubAccountId: '12345',
      githubUsername: 'octocat',
      walletId: 'User_github:12345',
    })

    vi.mocked(em.findOne).mockResolvedValue(binding)
    vi.mocked(em.find).mockResolvedValue([auditEvent])

    const result = await service.getStatus({
      walletId: 'User_github:12345',
    } as any)

    expect(rootEm.fork).toHaveBeenCalled()
    expect(em.findOne).toHaveBeenCalledWith(ContributorBinding, { walletId: 'User_github:12345' })
    expect(em.find).toHaveBeenCalledWith(
      ContributorAuditEvent,
      { walletId: 'User_github:12345' },
      { orderBy: { createdAt: 'DESC' }, limit: 20 },
    )
    expect(result.verificationStatus).toBe('GpgVerified')
    expect(result.github).toEqual({
      accountId: '12345',
      username: 'octocat',
    })
    expect(result.auditEvents).toHaveLength(1)
  })
})
