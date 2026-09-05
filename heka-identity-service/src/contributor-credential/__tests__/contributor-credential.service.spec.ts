/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
import { createMock } from '@golevelup/ts-vitest'
import { EntityManager } from '@mikro-orm/core'
import { ConflictException, NotFoundException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ContributorBinding } from 'contributor-onboarding'
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

/** Builds a minimal verified ContributorBinding for use in tests. */
function buildBinding(overrides: Partial<ContributorBinding> = {}): ContributorBinding {
  const b = new ContributorBinding({
    githubAccountId: '11111111',
    githubUsername: 'test-contributor',
    walletId: 'User_demo',
    gpgFingerprint: 'AABBCCDDEEFF00112233445566778899AABBCCDD',
    verifiedAt: new Date('2026-07-13T10:00:00.000Z'),
  })
  return Object.assign(b, overrides)
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

function buildFakeTenantAgent(overrides: Partial<{
  createdDids: Array<{ did: string }>
  verificationMethods: Array<{ id: string }>
  credentialOfferUri: string
}> = {}) {
  const createdDids = overrides.createdDids ?? [{ did: FAKE_ISSUER_DID }]
  const verificationMethods = overrides.verificationMethods ?? [{ id: FAKE_VERIFICATION_METHOD }]
  const credentialOfferUri = overrides.credentialOfferUri ?? FAKE_CREDENTIAL_OFFER_URI

  return {
    dids: {
      getCreatedDids: vi.fn().mockResolvedValue(createdDids),
      resolve: vi.fn().mockResolvedValue({
        didDocument: { verificationMethod: verificationMethods },
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

  beforeEach(() => {
    let fakeTenantAgent = buildFakeTenantAgent()

    // Credo agent mock — withTenantAgent invokes the callback with the fake tenant agent
    agentMock = {
      modules: {
        tenants: {
          withTenantAgent: vi.fn().mockImplementation(
            async (_opts: unknown, cb: (ta: typeof fakeTenantAgent) => Promise<void>) => {
              await cb(fakeTenantAgent)
            },
          ),
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

    service = new ContributorCredentialService(
      agentMock,
      mockAgentConfig,
      emMock as unknown as EntityManager,
      issuerServiceMock,
    )
  })

  // -------------------------------------------------------------------------
  // onApplicationBootstrap
  // -------------------------------------------------------------------------

  describe('onApplicationBootstrap', () => {
    it('creates issuer when demo tenant wallet exists and no issuer is registered', async () => {
      vi.mocked(emForkMock.findOne).mockResolvedValue({ id: 'User_demo', tenantId: 'tenant-abc' } as any)
      vi.mocked(issuerServiceMock.find).mockResolvedValue([])

      await service.onApplicationBootstrap()

      expect(issuerServiceMock.createIssuer).toHaveBeenCalledOnce()
      const callArgs = vi.mocked(issuerServiceMock.createIssuer).mock.calls[0][1]
      expect(callArgs.credentialsSupported).toHaveLength(1)
      expect(callArgs.credentialsSupported[0].id).toBe(CONTRIBUTOR_CREDENTIAL_SUPPORTED_ID)
      expect((callArgs.credentialsSupported[0] as any).vct).toBe(CONTRIBUTOR_CREDENTIAL_VCT)
    })

    it('skips creation when credential config is already registered', async () => {
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
      expect(issuerServiceMock.updateIssuerMetadata).not.toHaveBeenCalled()
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
      vi.mocked(emMock.findOne).mockResolvedValue(buildBinding())
      vi.mocked(emForkMock.findOne).mockResolvedValue({ id: 'User_demo', tenantId: 'tenant-abc' } as any)
    })

    it('returns a credential offer URI for a verified contributor', async () => {
      const result = await service.issueContributorCredential('11111111')

      expect(result).toMatch(/^openid-credential-offer:\/\//)
    })

    it('calls createCredentialOffer with the correct credential configuration ID', async () => {
      await service.issueContributorCredential('11111111')

      // We verify indirectly via the agentMock's withTenantAgent callback
      const withTenantCall = vi.mocked(agentMock.modules.tenants.withTenantAgent)
      expect(withTenantCall).toHaveBeenCalled()
    })

    it('passes the correct payload through issuance metadata', async () => {
      await service.issueContributorCredential('11111111')

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
      expect(meta.payload.walletId).toBe('User_demo')
    })

    it('sets the correct disclosure frame matching the Week 2 policy', async () => {
      await service.issueContributorCredential('11111111')

      const withTenantCb = vi.mocked(agentMock.modules.tenants.withTenantAgent).mock.calls[0][1]
      const spyTenantAgent = buildFakeTenantAgent()
      await withTenantCb(spyTenantAgent)

      const offerArgs = vi.mocked(spyTenantAgent.openid4vc.issuer.createCredentialOffer).mock.calls[0][0]
      const { disclosureFrame } = offerArgs.issuanceMetadata.credentials[0]

      expect(disclosureFrame._sd).toEqual(expect.arrayContaining([...CONTRIBUTOR_CREDENTIAL_SELECTIVE_CLAIMS]))
      expect(disclosureFrame._sd).toHaveLength(CONTRIBUTOR_CREDENTIAL_SELECTIVE_CLAIMS.length)
    })

    it('does not include non-selectively-disclosable claims in the disclosure frame', async () => {
      await service.issueContributorCredential('11111111')

      const withTenantCb = vi.mocked(agentMock.modules.tenants.withTenantAgent).mock.calls[0][1]
      const spyTenantAgent = buildFakeTenantAgent()
      await withTenantCb(spyTenantAgent)

      const offerArgs = vi.mocked(spyTenantAgent.openid4vc.issuer.createCredentialOffer).mock.calls[0][0]
      const { _sd } = offerArgs.issuanceMetadata.credentials[0].disclosureFrame as { _sd: string[] }

      expect(_sd).not.toContain('githubAccountId')
      expect(_sd).not.toContain('verifiedAt')
      expect(_sd).not.toContain('walletId')
    })

    it('uses the first verification method from the DID document (deterministic selection)', async () => {
      await service.issueContributorCredential('11111111')

      const withTenantCb = vi.mocked(agentMock.modules.tenants.withTenantAgent).mock.calls[0][1]
      const spyTenantAgent = buildFakeTenantAgent()
      await withTenantCb(spyTenantAgent)

      const offerArgs = vi.mocked(spyTenantAgent.openid4vc.issuer.createCredentialOffer).mock.calls[0][0]
      const { issuer } = offerArgs.issuanceMetadata.credentials[0]

      expect(issuer.didUrl).toBe(FAKE_VERIFICATION_METHOD)
      expect(issuer.did).toBe(FAKE_ISSUER_DID)
    })

    it('throws NotFoundException when no binding exists', async () => {
      vi.mocked(emMock.findOne).mockReset()
      vi.mocked(emMock.findOne).mockResolvedValueOnce(null)

      await expect(service.issueContributorCredential('99999999')).rejects.toThrow(NotFoundException)
    })

    it('throws ConflictException when binding exists but GPG verification is incomplete', async () => {
      vi.mocked(emMock.findOne).mockReset()
      const unverifiedBinding = buildBinding({ gpgFingerprint: undefined, verifiedAt: undefined })
      vi.mocked(emMock.findOne).mockResolvedValueOnce(unverifiedBinding)

      await expect(service.issueContributorCredential('11111111')).rejects.toThrow(ConflictException)
    })

    it('throws NotFoundException when demo tenant wallet is not initialised', async () => {
      vi.mocked(emMock.findOne).mockReset()
      vi.mocked(emMock.findOne).mockResolvedValueOnce(buildBinding())
      vi.mocked(emForkMock.findOne).mockReset()
      vi.mocked(emForkMock.findOne).mockResolvedValueOnce(null)

      await expect(service.issueContributorCredential('11111111')).rejects.toThrow(NotFoundException)
    })
  })
})
