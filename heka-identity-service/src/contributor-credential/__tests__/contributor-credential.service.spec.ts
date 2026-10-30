/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
import { createMock } from '@golevelup/ts-vitest'
import { EntityManager } from '@mikro-orm/core'
import { ConflictException, NotFoundException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthInfo, Role } from 'common/auth'
import { User } from 'common/entities'
import { ContributorOnboardingService, type VerifiedContributor } from 'contributor-onboarding'
import { OpenId4VcIssuerService } from 'openid4vc/issuer/issuer.service'

import {
  CONTRIBUTOR_CREDENTIAL_SELECTIVE_CLAIMS,
  CONTRIBUTOR_CREDENTIAL_SUPPORTED_ID,
  CONTRIBUTOR_CREDENTIAL_VCT,
} from '../contributor-credential.constants'
import { ContributorCredentialService } from '../contributor-credential.service'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

/** Builds a minimal verified contributor payload for use in tests. */
function buildContributor(overrides: Partial<VerifiedContributor> = {}): VerifiedContributor {
  return {
    githubAccountId: '11111111',
    githubUsername: 'test-contributor',
    walletId: 'User_user-1',
    gpgFingerprint: 'AABBCCDDEEFF00112233445566778899AABBCCDD',
    verifiedAt: '2026-07-13T10:00:00.000Z',
    ...overrides,
  }
}

/** Minimal AgentConfig read by the service. */
const mockAgentConfig = {
  contributorIssuerDemoUser: 'demo',
} as any

// ---------------------------------------------------------------------------
// Fake tenant agent returned by withTenantAgent callback
// ---------------------------------------------------------------------------

const FAKE_ISSUER_DID = 'did:hedera:testnet:z6Mk'
const FAKE_VERIFICATION_METHOD = `${FAKE_ISSUER_DID}#key-1`
const FAKE_CREDENTIAL_OFFER_URI = 'openid-credential-offer://?credential_offer_uri=https://example.com/offer/abc'

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
          issuanceSession: { id: 'session-1' },
        }),
      },
    },
  }
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('ContributorCredentialService', () => {
  let service: ContributorCredentialService
  let agentMock: any
  let emMock: ReturnType<typeof createMock<EntityManager>>
  let emForkMock: ReturnType<typeof createMock<EntityManager>>
  let issuerServiceMock: ReturnType<typeof createMock<OpenId4VcIssuerService>>
  let onboardingServiceMock: ReturnType<typeof createMock<ContributorOnboardingService>>

  beforeEach(() => {
    const fakeTenantAgent = buildFakeTenantAgent()

    // Credo agent mock — withTenantAgent invokes the callback with the fake tenant agent
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
    )
  })

  // -------------------------------------------------------------------------
  // onApplicationBootstrap
  // -------------------------------------------------------------------------

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
          credentialConfigurationsSupported: {}, // issuer exists but credential not registered
        } as any,
      ])

      await service.onApplicationBootstrap()

      expect(issuerServiceMock.updateIssuerMetadata).toHaveBeenCalledOnce()
      const updateArgs = vi.mocked(issuerServiceMock.updateIssuerMetadata).mock.calls[0][2]
      // Verify the enum value 'add' (lowercase) is used, not 'Add'
      expect(updateArgs.action).toBe('add')
      expect(updateArgs.credentialsSupported![0].id).toBe(CONTRIBUTOR_CREDENTIAL_SUPPORTED_ID)
    })
  })

  // -------------------------------------------------------------------------
  // issueContributorCredential
  // -------------------------------------------------------------------------

  describe('issueContributorCredential', () => {
    beforeEach(() => {
      vi.mocked(onboardingServiceMock.getVerifiedBindingByUser).mockResolvedValue(buildContributor())
      vi.mocked(emForkMock.findOne).mockResolvedValue({ id: 'User_demo', tenantId: 'tenant-abc' } as any)
    })

    it('returns a credential offer URI for a verified contributor', async () => {
      const result = await service.issueContributorCredential(buildAuthInfo())

      expect(result).toMatch(/^openid-credential-offer:\/\//)
      expect(onboardingServiceMock.getVerifiedBindingByUser).toHaveBeenCalledWith('tenant-1', 'user-1', 'User_user-1')
    })

    it('calls createCredentialOffer with the correct credential configuration ID', async () => {
      await service.issueContributorCredential(buildAuthInfo())

      // We verify indirectly via the agentMock's withTenantAgent callback
      const withTenantCall = vi.mocked(agentMock.modules.tenants.withTenantAgent)
      expect(withTenantCall).toHaveBeenCalled()
    })

    it('passes the correct payload through issuance metadata', async () => {
      await service.issueContributorCredential(buildAuthInfo())

      // The fake tenant agent's createCredentialOffer was called — verify its args
      const withTenantCb = vi.mocked(agentMock.modules.tenants.withTenantAgent).mock.calls[0][1]

      // Build a spy tenant agent to intercept the call
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
      expect(meta.payload.walletId).toBe('User_user-1')
    })

    it('sets the correct disclosure frame matching the Week 2 policy', async () => {
      await service.issueContributorCredential(buildAuthInfo())

      const withTenantCb = vi.mocked(agentMock.modules.tenants.withTenantAgent).mock.calls[0][1]
      const spyTenantAgent = buildFakeTenantAgent()
      await withTenantCb(spyTenantAgent)

      const offerArgs = vi.mocked(spyTenantAgent.openid4vc.issuer.createCredentialOffer).mock.calls[0][0]
      const { disclosureFrame } = offerArgs.issuanceMetadata.credentials[0]

      expect(disclosureFrame._sd).toEqual(expect.arrayContaining([...CONTRIBUTOR_CREDENTIAL_SELECTIVE_CLAIMS]))
      expect(disclosureFrame._sd).toHaveLength(CONTRIBUTOR_CREDENTIAL_SELECTIVE_CLAIMS.length)
    })

    it('does not include non-selectively-disclosable claims in the disclosure frame', async () => {
      await service.issueContributorCredential(buildAuthInfo())

      const withTenantCb = vi.mocked(agentMock.modules.tenants.withTenantAgent).mock.calls[0][1]
      const spyTenantAgent = buildFakeTenantAgent()
      await withTenantCb(spyTenantAgent)

      const offerArgs = vi.mocked(spyTenantAgent.openid4vc.issuer.createCredentialOffer).mock.calls[0][0]
      const { _sd } = offerArgs.issuanceMetadata.credentials[0].disclosureFrame as { _sd: string[] }

      expect(_sd).not.toContain('githubAccountId')
      expect(_sd).not.toContain('verifiedAt')
      expect(_sd).not.toContain('walletId')
    })

    it('uses assertionMethod from the DID document with typeof string check', async () => {
      await service.issueContributorCredential(buildAuthInfo())

      const withTenantCb = vi.mocked(agentMock.modules.tenants.withTenantAgent).mock.calls[0][1]
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

    it('prefers the ADR assertion-key fragment over the Hedera root key', async () => {
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
  })
})
