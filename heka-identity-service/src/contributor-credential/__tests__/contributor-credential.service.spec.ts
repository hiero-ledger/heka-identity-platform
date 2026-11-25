import { RecordNotFoundError } from '@credo-ts/core'
import { OpenId4VcIssuanceSessionState } from '@credo-ts/openid4vc'
import { createMock } from '@golevelup/ts-vitest'
import { EntityManager } from '@mikro-orm/core'
import {
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Agent } from 'common/agent'
import { AuthInfo, Role } from 'common/auth'
import { User, Wallet } from 'common/entities'
import { Logger } from 'common/logger'
import { GithubConfig, githubConfigDefaults } from 'config/github'
import { ContributorOnboardingService, type VerifiedContributor } from 'contributor-onboarding'
import {
  OpenId4VcIssuanceSessionCreateOfferSdJwtCredentialOptions,
  OpenId4VcIssuanceSessionsCreateOfferDto,
} from 'openid4vc/issuance-sessions/dto'
import { OpenId4VcIssuanceSessionService } from 'openid4vc/issuance-sessions/issuance-session.service'

import { ContributorCredentialIssuance } from '../contributor-credential-issuance.entity'
import {
  CONTRIBUTOR_CREDENTIAL_LIFETIME_SECONDS,
  CONTRIBUTOR_CREDENTIAL_OFFER_TTL_SECONDS,
  CONTRIBUTOR_CREDENTIAL_TX_CODE_LENGTH,
} from '../contributor-credential.constants'
import { ContributorCredentialService } from '../contributor-credential.service'
import { ContributorIssuer } from '../contributor-credential.types'
import { ContributorIssuerService } from '../contributor-issuer.service'

const config: GithubConfig = {
  ...githubConfigDefaults,
  enabled: true,
  issuerOrgId: 'hiero-contributors',
  issuerDid: 'did:key:z6MkIssuer',
}

const issuer: ContributorIssuer = {
  walletId: 'Organization_hiero-contributors',
  tenantId: 'tenant-org',
  did: 'did:key:z6MkIssuer',
  supportedCredentialId: 'GitHub Contributor:key:vc+sd-jwt',
  publicIssuerId: 'did:key:z6MkIssuer',
}

const contributor: VerifiedContributor = {
  githubAccountId: '11111111',
  githubUsername: 'test-contributor',
  gpgFingerprint: 'AABBCCDDEEFF00112233445566778899AABBCCDD',
  verifiedAt: '2026-07-13T10:00:00.000Z',
}

const OFFER_EXPIRES_AT = new Date('2026-10-30T12:10:00.000Z')

function authInfo(): AuthInfo {
  return {
    userId: 'user-1',
    user: { id: 'user-1' } as User,
    userName: 'ada',
    role: Role.User,
    walletId: 'User_user-1',
    tenantId: 'tenant-1',
  }
}

describe('ContributorCredentialService', () => {
  let service: ContributorCredentialService
  let tenantAgent: { openid4vc: { issuer: { getIssuanceSessionById: ReturnType<typeof vi.fn> } } }
  let agent: Agent
  let em: {
    findOne: ReturnType<typeof vi.fn>
    persist: ReturnType<typeof vi.fn>
    flush: ReturnType<typeof vi.fn>
    getReference: ReturnType<typeof vi.fn>
  }
  let issuanceSessionService: OpenId4VcIssuanceSessionService
  let issuerService: ContributorIssuerService
  let onboardingService: ContributorOnboardingService

  beforeEach(() => {
    tenantAgent = { openid4vc: { issuer: { getIssuanceSessionById: vi.fn() } } }
    agent = {
      modules: {
        tenants: {
          withTenantAgent: vi.fn(async (_options: unknown, callback: (t: typeof tenantAgent) => Promise<void>) =>
            callback(tenantAgent),
          ),
        },
      },
    } as unknown as Agent
    em = {
      findOne: vi.fn().mockResolvedValue(null),
      persist: vi.fn(),
      flush: vi.fn().mockResolvedValue(undefined),
      getReference: vi.fn((_entity: unknown, id: string) => ({ id })),
    }
    issuanceSessionService = createMock<OpenId4VcIssuanceSessionService>({
      offer: vi.fn().mockResolvedValue({
        credentialOffer: 'openid-credential-offer://?credential_offer_uri=https://example.com/offers/abc',
        issuanceSession: { id: 'session-1', userPin: '12345678', expiresAt: OFFER_EXPIRES_AT },
      }),
    })
    issuerService = createMock<ContributorIssuerService>({ resolveIssuer: vi.fn().mockResolvedValue(issuer) })
    onboardingService = createMock<ContributorOnboardingService>({
      getVerifiedBindingByUser: vi.fn().mockResolvedValue(contributor),
    })

    service = new ContributorCredentialService(
      agent,
      config,
      em as unknown as EntityManager,
      issuanceSessionService,
      issuerService,
      onboardingService,
      createMock<Logger>(),
    )
  })

  function offerCall(): [AuthInfo, unknown, OpenId4VcIssuanceSessionsCreateOfferDto] {
    const [call] = vi.mocked(issuanceSessionService.offer).mock.calls
    return call as [AuthInfo, unknown, OpenId4VcIssuanceSessionsCreateOfferDto]
  }

  describe('offer', () => {
    it('returns the offer, its tx code, expiry and issuance session id', async () => {
      await expect(service.offer(authInfo())).resolves.toEqual({
        credentialOffer: 'openid-credential-offer://?credential_offer_uri=https://example.com/offers/abc',
        txCode: '12345678',
        expiresAt: OFFER_EXPIRES_AT.toISOString(),
        issuanceSessionId: 'session-1',
      })
      expect(onboardingService.getVerifiedBindingByUser).toHaveBeenCalledWith('user-1')
    })

    it("offers through the generic offer as the organization wallet, in the organization's tenant", async () => {
      await service.offer(authInfo())

      const [issuerAuthInfo, passedTenantAgent] = offerCall()
      expect(issuerAuthInfo).toMatchObject({
        userId: 'user-1',
        role: Role.OrgAdmin,
        orgId: 'hiero-contributors',
        walletId: 'Organization_hiero-contributors',
        tenantId: 'tenant-org',
      })
      expect(passedTenantAgent).toBe(tenantAgent)
      expect(vi.mocked(agent.modules.tenants.withTenantAgent).mock.calls[0][0]).toEqual({ tenantId: 'tenant-org' })
    })

    it('asks for the pinned DID, its registration, the claims as disclosures, a tx code and a 10 minute lifetime', async () => {
      const before = Math.floor(Date.now() / 1000)
      await service.offer(authInfo())

      const [, , request] = offerCall()
      expect(request).toEqual({
        publicIssuerId: 'did:key:z6MkIssuer',
        credentials: [
          {
            credentialSupportedId: 'GitHub Contributor:key:vc+sd-jwt',
            format: 'vc+sd-jwt',
            issuer: { method: 'did', did: 'did:key:z6MkIssuer' },
            payload: {
              githubAccountId: '11111111',
              githubUsername: 'test-contributor',
              gpgFingerprint: 'AABBCCDDEEFF00112233445566778899AABBCCDD',
              verifiedAt: '2026-07-13T10:00:00.000Z',
              exp: expect.any(Number),
            },
            disclosureFrame: { _sd: ['githubAccountId', 'githubUsername', 'gpgFingerprint'] },
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
      })
      const { exp } = (request.credentials[0] as OpenId4VcIssuanceSessionCreateOfferSdJwtCredentialOptions).payload as {
        exp: number
      }
      expect(exp - before - CONTRIBUTOR_CREDENTIAL_LIFETIME_SECONDS).toBeGreaterThanOrEqual(0)
      expect(exp - before - CONTRIBUTOR_CREDENTIAL_LIFETIME_SECONDS).toBeLessThan(5)
    })

    it('records the offer for the caller with the claims it carries', async () => {
      await service.offer(authInfo())

      expect(em.persist).toHaveBeenCalledWith(expect.any(ContributorCredentialIssuance))
      expect(em.persist.mock.calls[0][0]).toMatchObject({
        user: { id: 'user-1' },
        issuanceSessionId: 'session-1',
        githubAccountId: '11111111',
        githubUsername: 'test-contributor',
        gpgFingerprint: 'AABBCCDDEEFF00112233445566778899AABBCCDD',
      })
      expect(em.flush).toHaveBeenCalled()
    })

    it('refuses an offer without a binding (404) before the issuer is checked', async () => {
      vi.mocked(onboardingService.getVerifiedBindingByUser).mockRejectedValue(new NotFoundException('no binding'))

      await expect(service.offer(authInfo())).rejects.toBeInstanceOf(NotFoundException)
      expect(issuerService.resolveIssuer).not.toHaveBeenCalled()
      expect(issuanceSessionService.offer).not.toHaveBeenCalled()
    })

    it('refuses an offer before GPG verification (409)', async () => {
      vi.mocked(onboardingService.getVerifiedBindingByUser).mockRejectedValue(new ConflictException('not verified'))

      await expect(service.offer(authInfo())).rejects.toBeInstanceOf(ConflictException)
      expect(issuanceSessionService.offer).not.toHaveBeenCalled()
    })

    it('answers 503 while the issuer is not set up, and offers nothing', async () => {
      vi.mocked(issuerService.resolveIssuer).mockRejectedValue(
        new ServiceUnavailableException('The contributor credential issuer is not set up: …'),
      )

      await expect(service.offer(authInfo())).rejects.toBeInstanceOf(ServiceUnavailableException)
      expect(issuanceSessionService.offer).not.toHaveBeenCalled()
      expect(em.persist).not.toHaveBeenCalled()
    })

    it.each([
      ['transaction code', { id: 'session-1', expiresAt: OFFER_EXPIRES_AT }],
      ['expiry', { id: 'session-1', userPin: '12345678' }],
    ])('refuses an offer that has no %s, and records nothing', async (_missing, issuanceSession) => {
      vi.mocked(issuanceSessionService.offer).mockResolvedValue({
        credentialOffer: 'openid-credential-offer://x',
        issuanceSession,
      } as never)

      await expect(service.offer(authInfo())).rejects.toBeInstanceOf(InternalServerErrorException)
      expect(em.persist).not.toHaveBeenCalled()
    })
  })

  describe('getOfferState', () => {
    const record = { issuanceSessionId: 'session-1' }
    const orgWallet = { id: 'Organization_hiero-contributors', tenantId: 'tenant-org' }

    function rows(found: { record?: unknown; wallet?: unknown }) {
      em.findOne.mockImplementation((entity: unknown) => {
        if (entity === ContributorCredentialIssuance) return found.record ?? null
        if (entity === Wallet) return found.wallet ?? null
        return null
      })
    }

    it("reads the state and expiry of the caller's own offer in the organization's tenant", async () => {
      rows({ record, wallet: orgWallet })
      tenantAgent.openid4vc.issuer.getIssuanceSessionById.mockResolvedValue({
        state: OpenId4VcIssuanceSessionState.Completed,
        expiresAt: OFFER_EXPIRES_AT,
      })

      await expect(service.getOfferState(authInfo(), 'session-1')).resolves.toEqual({
        state: 'Completed',
        expiresAt: OFFER_EXPIRES_AT.toISOString(),
      })
      expect(em.findOne).toHaveBeenCalledWith(ContributorCredentialIssuance, {
        issuanceSessionId: 'session-1',
        user: 'user-1',
      })
      expect(em.findOne).toHaveBeenCalledWith(Wallet, { id: 'Organization_hiero-contributors' })
      expect(tenantAgent.openid4vc.issuer.getIssuanceSessionById).toHaveBeenCalledWith('session-1')
    })

    it("answers 404 for another user's offer (no record of the caller's), without reading the session", async () => {
      rows({ wallet: orgWallet })

      await expect(service.getOfferState(authInfo(), 'session-1')).rejects.toBeInstanceOf(NotFoundException)
      expect(agent.modules.tenants.withTenantAgent).not.toHaveBeenCalled()
    })

    it('answers 404 when the issuance session was deleted', async () => {
      rows({ record, wallet: orgWallet })
      tenantAgent.openid4vc.issuer.getIssuanceSessionById.mockRejectedValue(
        new RecordNotFoundError('gone', { recordType: 'OpenId4VcIssuanceSessionRecord' }),
      )

      await expect(service.getOfferState(authInfo(), 'session-1')).rejects.toBeInstanceOf(NotFoundException)
    })

    it('passes other errors through', async () => {
      rows({ record, wallet: orgWallet })
      tenantAgent.openid4vc.issuer.getIssuanceSessionById.mockRejectedValue(new Error('storage down'))

      await expect(service.getOfferState(authInfo(), 'session-1')).rejects.toThrow('storage down')
    })
  })
})
