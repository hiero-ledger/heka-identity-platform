/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
import { createMock } from '@golevelup/ts-vitest'
import { EntityManager } from '@mikro-orm/core'
import { ConflictException, InternalServerErrorException, NotFoundException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthInfo, Role } from 'common/auth'
import { User } from 'common/entities'
import { Logger } from 'common/logger'
import { ContributorOnboardingService, type VerifiedContributor } from 'contributor-onboarding'
import { OpenId4VcIssuerService } from 'openid4vc/issuer/issuer.service'

import {
  CONTRIBUTOR_CREDENTIAL_LIFETIME_SECONDS,
  CONTRIBUTOR_CREDENTIAL_OFFER_TTL_SECONDS,
  CONTRIBUTOR_CREDENTIAL_SELECTIVE_CLAIMS,
  CONTRIBUTOR_CREDENTIAL_SUPPORTED_ID,
  CONTRIBUTOR_CREDENTIAL_TX_CODE_LENGTH,
  CONTRIBUTOR_CREDENTIAL_VCT,
} from '../contributor-credential.constants'
import { ContributorCredentialService } from '../contributor-credential.service'

function buildAuthInfo(): AuthInfo {
  return {
    userId: 'user-1',
    user: {} as User,
    userName: 'ada',
    role: Role.User,
    walletId: 'User_user-1',
    tenantId: 'tenant-1',
  }
}

function buildContributor(overrides: Partial<VerifiedContributor> = {}): VerifiedContributor {
  return {
    githubAccountId: '11111111',
    githubUsername: 'test-contributor',
    gpgFingerprint: 'AABBCCDDEEFF00112233445566778899AABBCCDD',
    verifiedAt: '2026-07-13T10:00:00.000Z',
    ...overrides,
  }
}

const mockAgentConfig = {
  contributorIssuerDemoUser: 'demo',
} as any

const FAKE_ISSUER_DID = 'did:hedera:testnet:z6Mk'
const FAKE_VERIFICATION_METHOD = `${FAKE_ISSUER_DID}#key-1`
const FAKE_CREDENTIAL_OFFER_URI = 'openid-credential-offer://?credential_offer_uri=https://example.com/offer/abc'
const FAKE_OFFER_EXPIRES_AT = new Date('2026-10-30T12:10:00.000Z')

/** The tenant agent that `withTenantAgent` hands to the service's callback. */
function buildFakeTenantAgent(
  overrides: Partial<{
    createdDids: Array<{ did: string }>
    verificationMethods: Array<{ id: string }>
    assertionMethods: Array<string | { id: string }>
    credentialOfferUri: string
  }> = {},
) {
  const createdDids = overrides.createdDids ?? [{ did: FAKE_ISSUER_DID }]
  const verificationMethods = overrides.verificationMethods ?? [{ id: FAKE_VERIFICATION_METHOD }]
  const assertionMethods = overrides.assertionMethods ?? [FAKE_VERIFICATION_METHOD]
  const credentialOfferUri = overrides.credentialOfferUri ?? FAKE_CREDENTIAL_OFFER_URI

  return {
    dids: {
      getCreatedDids: vi.fn().mockResolvedValue(createdDids),
      resolve: vi.fn().mockResolvedValue({
        didDocument: {
          verificationMethod: verificationMethods,
          assertionMethod: assertionMethods,
        },
      }),
    },
    openid4vc: {
      issuer: {
        createCredentialOffer: vi.fn().mockResolvedValue({
          credentialOffer: credentialOfferUri,
          issuanceSession: { id: 'session-1', userPin: '12345678', expiresAt: FAKE_OFFER_EXPIRES_AT },
        }),
      },
    },
  }
}

describe('ContributorCredentialService', () => {
  let service: ContributorCredentialService
  let agentMock: any
  let emMock: ReturnType<typeof createMock<EntityManager>>
  let emForkMock: ReturnType<typeof createMock<EntityManager>>
  let issuerServiceMock: ReturnType<typeof createMock<OpenId4VcIssuerService>>
  let onboardingServiceMock: ReturnType<typeof createMock<ContributorOnboardingService>>

  beforeEach(() => {
    const fakeTenantAgent = buildFakeTenantAgent()

    agentMock = {
      modules: {
        tenants: {
          withTenantAgent: vi
            .fn()
            .mockImplementation(async (_opts: unknown, cb: (ta: typeof fakeTenantAgent) => Promise<void>) => {
              await cb(fakeTenantAgent)
            }),
        },
      },
    }

    emForkMock = createMock<EntityManager>({
      findOne: vi.fn(),
    })
    emMock = createMock<EntityManager>({
      findOne: vi.fn(),
      fork: vi.fn().mockReturnValue(emForkMock),
    })

    issuerServiceMock = createMock<OpenId4VcIssuerService>({
      find: vi.fn().mockResolvedValue([]),
      createIssuer: vi.fn().mockResolvedValue({ publicIssuerId: FAKE_ISSUER_DID }),
      updateIssuerMetadata: vi.fn().mockResolvedValue({}),
    })

    onboardingServiceMock = createMock<ContributorOnboardingService>({
      getVerifiedBindingByUser: vi.fn().mockResolvedValue(buildContributor()),
    })

    service = new ContributorCredentialService(
      agentMock,
      mockAgentConfig,
      emMock,
      issuerServiceMock,
      onboardingServiceMock,
      createMock<Logger>(),
    )
  })

  describe('onApplicationBootstrap', () => {
    it('creates an OID4VCI issuer when none exists for the demo tenant DID', async () => {
      vi.mocked(emForkMock.findOne).mockResolvedValue({ id: 'User_demo', tenantId: 'tenant-abc' } as any)
      vi.mocked(issuerServiceMock.find).mockResolvedValue([])

      await service.onApplicationBootstrap()

      expect(emForkMock.findOne).toHaveBeenCalledWith(expect.anything(), { id: 'User_demo' })
      expect(issuerServiceMock.createIssuer).toHaveBeenCalledOnce()
      const callArgs = vi.mocked(issuerServiceMock.createIssuer).mock.calls[0][1]
      expect(callArgs.credentialsSupported).toHaveLength(1)
      expect(callArgs.credentialsSupported[0].id).toBe(CONTRIBUTOR_CREDENTIAL_SUPPORTED_ID)
      expect((callArgs.credentialsSupported[0] as any).vct).toBe(CONTRIBUTOR_CREDENTIAL_VCT)
      expect(Object.keys((callArgs.credentialsSupported[0] as any).claims)).toEqual([
        'githubAccountId',
        'githubUsername',
        'gpgFingerprint',
        'verifiedAt',
      ])
    })

    it('refreshes the credential config when it is already registered', async () => {
      vi.mocked(emForkMock.findOne).mockResolvedValue({ id: 'User_demo', tenantId: 'tenant-abc' } as any)
      vi.mocked(issuerServiceMock.find).mockResolvedValue([
        {
          publicIssuerId: FAKE_ISSUER_DID,
          credentialsSupported: [
            { id: CONTRIBUTOR_CREDENTIAL_SUPPORTED_ID, format: 'vc+sd-jwt', vct: CONTRIBUTOR_CREDENTIAL_VCT },
          ],
        } as any,
      ])

      await service.onApplicationBootstrap()

      expect(issuerServiceMock.createIssuer).not.toHaveBeenCalled()
      expect(issuerServiceMock.updateIssuerMetadata).toHaveBeenCalledOnce()
      const updated = vi.mocked(issuerServiceMock.updateIssuerMetadata).mock.calls[0][2]
      expect(updated.credentialsSupported?.[0]).toMatchObject({
        id: CONTRIBUTOR_CREDENTIAL_SUPPORTED_ID,
        cryptographic_binding_methods_supported: ['jwk'],
      })
    })

    it('logs a warning and does not throw when demo wallet is not found', async () => {
      vi.mocked(emForkMock.findOne).mockResolvedValue(null)

      await expect(service.onApplicationBootstrap()).resolves.toBeUndefined()
      expect(issuerServiceMock.createIssuer).not.toHaveBeenCalled()
    })

    it('adds credential config to an existing issuer that does not have it yet', async () => {
      vi.mocked(emForkMock.findOne).mockResolvedValue({ id: 'User_demo', tenantId: 'tenant-abc' } as any)
      vi.mocked(issuerServiceMock.find).mockResolvedValue([
        {
          publicIssuerId: FAKE_ISSUER_DID,
          credentialConfigurationsSupported: {},
        } as any,
      ])

      await service.onApplicationBootstrap()

      expect(issuerServiceMock.updateIssuerMetadata).toHaveBeenCalledOnce()
      const updateArgs = vi.mocked(issuerServiceMock.updateIssuerMetadata).mock.calls[0][2]
      expect(updateArgs.action).toBe('add')
      expect(updateArgs.credentialsSupported![0].id).toBe(CONTRIBUTOR_CREDENTIAL_SUPPORTED_ID)
    })
  })

  describe('issueContributorCredential', () => {
    beforeEach(() => {
      vi.mocked(onboardingServiceMock.getVerifiedBindingByUser).mockResolvedValue(buildContributor())
      vi.mocked(emForkMock.findOne).mockResolvedValue({ id: 'User_demo', tenantId: 'tenant-abc' } as any)
    })

    it('returns a credential offer URI for a verified contributor', async () => {
      const result = await service.issueContributorCredential(buildAuthInfo())

      expect(result.credentialOffer).toMatch(/^openid-credential-offer:\/\//)
      expect(result.txCode).toBe('12345678')
      expect(result.expiresAt).toBe(FAKE_OFFER_EXPIRES_AT.toISOString())
      expect(onboardingServiceMock.getVerifiedBindingByUser).toHaveBeenCalledWith('user-1')
    })

    it('calls createCredentialOffer with the correct credential configuration ID', async () => {
      await service.issueContributorCredential(buildAuthInfo())

      const withTenantCall = vi.mocked(agentMock.modules.tenants.withTenantAgent)
      expect(withTenantCall).toHaveBeenCalled()
    })

    it('passes the correct payload through issuance metadata', async () => {
      await service.issueContributorCredential(buildAuthInfo())

      const tenantCalls = vi.mocked(agentMock.modules.tenants.withTenantAgent).mock.calls
      const withTenantCb = tenantCalls[tenantCalls.length - 1][1]

      const spyTenantAgent = buildFakeTenantAgent()
      await withTenantCb(spyTenantAgent)

      const offerArgs = vi.mocked(spyTenantAgent.openid4vc.issuer.createCredentialOffer).mock.calls[0][0]
      const meta = offerArgs.issuanceMetadata.credentials[0]

      expect(meta.format).toBe('vc+sd-jwt')
      expect(meta.credentialSupportedId).toBe(CONTRIBUTOR_CREDENTIAL_SUPPORTED_ID)
      expect(meta.type).toBe(CONTRIBUTOR_CREDENTIAL_VCT)
      expect(meta.payload.githubAccountId).toBe('11111111')
      expect(meta.payload.githubUsername).toBe('test-contributor')
      expect(meta.payload.gpgFingerprint).toBe('AABBCCDDEEFF00112233445566778899AABBCCDD')
      expect(meta.payload.verifiedAt).toBe('2026-07-13T10:00:00.000Z')
      expect(meta.payload).not.toHaveProperty('walletId')
      expect(meta.payload.exp).toBeGreaterThan(
        Math.floor(Date.now() / 1000) + CONTRIBUTOR_CREDENTIAL_LIFETIME_SECONDS - 5,
      )
      expect(meta.payload.exp).toBeLessThan(Math.floor(Date.now() / 1000) + CONTRIBUTOR_CREDENTIAL_LIFETIME_SECONDS + 5)
      expect(offerArgs.preAuthorizedCodeFlowConfig.txCode).toEqual({
        input_mode: 'numeric',
        length: CONTRIBUTOR_CREDENTIAL_TX_CODE_LENGTH,
        description: 'Enter the code shown on the Heka contributor page.',
      })
      expect(offerArgs.expirationInSeconds).toBe(CONTRIBUTOR_CREDENTIAL_OFFER_TTL_SECONDS)
    })

    it('makes the GitHub account, login and key fingerprint selectively disclosable', async () => {
      await service.issueContributorCredential(buildAuthInfo())

      const tenantCalls = vi.mocked(agentMock.modules.tenants.withTenantAgent).mock.calls
      const withTenantCb = tenantCalls[tenantCalls.length - 1][1]
      const spyTenantAgent = buildFakeTenantAgent()
      await withTenantCb(spyTenantAgent)

      const offerArgs = vi.mocked(spyTenantAgent.openid4vc.issuer.createCredentialOffer).mock.calls[0][0]
      const { disclosureFrame } = offerArgs.issuanceMetadata.credentials[0]

      expect(disclosureFrame._sd).toEqual(expect.arrayContaining([...CONTRIBUTOR_CREDENTIAL_SELECTIVE_CLAIMS]))
      expect(disclosureFrame._sd).toHaveLength(CONTRIBUTOR_CREDENTIAL_SELECTIVE_CLAIMS.length)
      expect([...disclosureFrame._sd].sort()).toEqual(['githubAccountId', 'githubUsername', 'gpgFingerprint'])
    })

    it('does not include non-selectively-disclosable claims in the disclosure frame', async () => {
      await service.issueContributorCredential(buildAuthInfo())

      const tenantCalls = vi.mocked(agentMock.modules.tenants.withTenantAgent).mock.calls
      const withTenantCb = tenantCalls[tenantCalls.length - 1][1]
      const spyTenantAgent = buildFakeTenantAgent()
      await withTenantCb(spyTenantAgent)

      const offerArgs = vi.mocked(spyTenantAgent.openid4vc.issuer.createCredentialOffer).mock.calls[0][0]
      const { _sd } = offerArgs.issuanceMetadata.credentials[0].disclosureFrame as { _sd: string[] }

      expect(_sd).not.toContain('verifiedAt')
      expect(_sd).not.toContain('exp')
    })

    it('uses assertionMethod from the DID document with typeof string check', async () => {
      await service.issueContributorCredential(buildAuthInfo())

      const tenantCalls = vi.mocked(agentMock.modules.tenants.withTenantAgent).mock.calls
      const withTenantCb = tenantCalls[tenantCalls.length - 1][1]
      const spyTenantAgent = buildFakeTenantAgent()
      await withTenantCb(spyTenantAgent)

      const offerArgs = vi.mocked(spyTenantAgent.openid4vc.issuer.createCredentialOffer).mock.calls[0][0]
      const { issuer } = offerArgs.issuanceMetadata.credentials[0]

      expect(issuer.didUrl).toBe(FAKE_VERIFICATION_METHOD)
      expect(issuer.did).toBe(FAKE_ISSUER_DID)
    })

    it('supports assertionMethod when it is an embedded object with id', async () => {
      const embeddedKeyId = `${FAKE_ISSUER_DID}#key-embedded`
      const spyTenantAgent = buildFakeTenantAgent({
        assertionMethods: [{ id: embeddedKeyId }],
      })

      agentMock.modules.tenants.withTenantAgent = vi
        .fn()
        .mockImplementation(async (_opts: unknown, cb: (ta: typeof spyTenantAgent) => Promise<void>) => {
          await cb(spyTenantAgent)
        })

      await service.issueContributorCredential(buildAuthInfo())

      const offerArgs = vi.mocked(spyTenantAgent.openid4vc.issuer.createCredentialOffer).mock.calls[0][0]
      const { issuer } = offerArgs.issuanceMetadata.credentials[0]

      expect(issuer.didUrl).toBe(embeddedKeyId)
    })

    it('selects #did-root-key from assertionMethod even when another key is first', async () => {
      const rootKeyId = `${FAKE_ISSUER_DID}#did-root-key`
      const otherKeyId = `${FAKE_ISSUER_DID}#key-agreement`
      const spyTenantAgent = buildFakeTenantAgent({
        verificationMethods: [{ id: otherKeyId }, { id: rootKeyId }],
        assertionMethods: [otherKeyId, rootKeyId],
      })

      agentMock.modules.tenants.withTenantAgent = vi
        .fn()
        .mockImplementation(async (_opts: unknown, cb: (ta: typeof spyTenantAgent) => Promise<void>) => {
          await cb(spyTenantAgent)
        })

      await service.issueContributorCredential(buildAuthInfo())

      const offerArgs = vi.mocked(spyTenantAgent.openid4vc.issuer.createCredentialOffer).mock.calls[0][0]
      expect(offerArgs.issuanceMetadata.credentials[0].issuer.didUrl).toBe(rootKeyId)
    })

    it('prefers the #assertion-key fragment over the Hedera root key', async () => {
      const assertionKeyId = `${FAKE_ISSUER_DID}#assertion-key`
      const rootKeyId = `${FAKE_ISSUER_DID}#did-root-key`
      const spyTenantAgent = buildFakeTenantAgent({
        verificationMethods: [{ id: rootKeyId }, { id: assertionKeyId }],
        assertionMethods: [rootKeyId, assertionKeyId],
      })

      agentMock.modules.tenants.withTenantAgent = vi
        .fn()
        .mockImplementation(async (_opts: unknown, cb: (ta: typeof spyTenantAgent) => Promise<void>) => {
          await cb(spyTenantAgent)
        })

      await service.issueContributorCredential(buildAuthInfo())

      const offerArgs = vi.mocked(spyTenantAgent.openid4vc.issuer.createCredentialOffer).mock.calls[0][0]
      expect(offerArgs.issuanceMetadata.credentials[0].issuer.didUrl).toBe(assertionKeyId)
    })

    it('throws when assertionMethod is missing instead of using verificationMethod order', async () => {
      const fallbackKeyId = `${FAKE_ISSUER_DID}#key-fallback`
      const spyTenantAgent = buildFakeTenantAgent({
        verificationMethods: [{ id: fallbackKeyId }],
        assertionMethods: [],
      })

      agentMock.modules.tenants.withTenantAgent = vi
        .fn()
        .mockImplementation(async (_opts: unknown, cb: (ta: typeof spyTenantAgent) => Promise<void>) => {
          await cb(spyTenantAgent)
        })

      await expect(service.issueContributorCredential(buildAuthInfo())).rejects.toThrow(NotFoundException)
    })

    it('throws NotFoundException when no verified binding exists for the user', async () => {
      vi.mocked(onboardingServiceMock.getVerifiedBindingByUser).mockRejectedValueOnce(
        new NotFoundException('No contributor binding found'),
      )

      await expect(service.issueContributorCredential(buildAuthInfo())).rejects.toThrow(NotFoundException)
    })

    it('throws ConflictException when GPG verification is incomplete', async () => {
      vi.mocked(onboardingServiceMock.getVerifiedBindingByUser).mockRejectedValueOnce(
        new ConflictException('GPG verification incomplete'),
      )

      await expect(service.issueContributorCredential(buildAuthInfo())).rejects.toThrow(ConflictException)
    })

    it('throws NotFoundException when demo tenant wallet is not initialised', async () => {
      vi.mocked(emForkMock.findOne).mockReset()
      vi.mocked(emForkMock.findOne).mockResolvedValueOnce(null)

      await expect(service.issueContributorCredential(buildAuthInfo())).rejects.toThrow(NotFoundException)
    })

    it('refuses an offer that has no expiry', async () => {
      const spyTenantAgent = buildFakeTenantAgent()
      vi.mocked(spyTenantAgent.openid4vc.issuer.createCredentialOffer).mockResolvedValue({
        credentialOffer: FAKE_CREDENTIAL_OFFER_URI,
        issuanceSession: { id: 'session-1', userPin: '12345678' },
      })
      agentMock.modules.tenants.withTenantAgent = vi
        .fn()
        .mockImplementation(async (_opts: unknown, cb: (tenantAgent: typeof spyTenantAgent) => Promise<void>) => {
          await cb(spyTenantAgent)
        })

      await expect(service.issueContributorCredential(buildAuthInfo())).rejects.toThrow(InternalServerErrorException)
    })

    it('refuses an offer that has no transaction code', async () => {
      const spyTenantAgent = buildFakeTenantAgent()
      vi.mocked(spyTenantAgent.openid4vc.issuer.createCredentialOffer).mockResolvedValue({
        credentialOffer: FAKE_CREDENTIAL_OFFER_URI,
        issuanceSession: { id: 'session-1' },
      })
      agentMock.modules.tenants.withTenantAgent = vi
        .fn()
        .mockImplementation(async (_opts: unknown, cb: (tenantAgent: typeof spyTenantAgent) => Promise<void>) => {
          await cb(spyTenantAgent)
        })

      await expect(service.issueContributorCredential(buildAuthInfo())).rejects.toThrow(InternalServerErrorException)
    })

    it('registers the issuer on the next offer after startup had no demo wallet', async () => {
      vi.mocked(emForkMock.findOne).mockResolvedValueOnce(null)
      await service.onApplicationBootstrap()
      expect(issuerServiceMock.createIssuer).not.toHaveBeenCalled()

      vi.mocked(emForkMock.findOne).mockResolvedValue({ id: 'User_demo', tenantId: 'tenant-abc' } as any)
      const result = await service.issueContributorCredential(buildAuthInfo())

      expect(result.txCode).toBe('12345678')
      expect(issuerServiceMock.createIssuer).toHaveBeenCalledOnce()
    })

    it('runs one issuer registration when two offers overlap', async () => {
      let release!: () => void
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      vi.mocked(issuerServiceMock.find).mockImplementation(async () => {
        await gate
        return []
      })

      const first = service.issueContributorCredential(buildAuthInfo())
      const second = service.issueContributorCredential(buildAuthInfo())
      release()
      const [left, right] = await Promise.all([first, second])

      expect(left.txCode).toBe('12345678')
      expect(right.txCode).toBe('12345678')
      expect(issuerServiceMock.createIssuer).toHaveBeenCalledOnce()
    })
  })
})
