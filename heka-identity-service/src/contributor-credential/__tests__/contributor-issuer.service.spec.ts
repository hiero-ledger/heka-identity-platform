import { createMock } from '@golevelup/ts-vitest'
import { EntityManager } from '@mikro-orm/core'
import { ServiceUnavailableException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Agent } from 'common/agent'
import { DID_DEACTIVATED_TAG } from 'common/did-registrar'
import { Schema, Wallet } from 'common/entities'
import { Logger } from 'common/logger'
import { OpenId4VCCredentialRegistrationFormat, ProtocolType } from 'common/types'
import { GithubConfig, githubConfigDefaults } from 'config/github'

import { didRecordStub } from '../../../test/helpers/mock-records'
import { ContributorIssuerService } from '../contributor-issuer.service'

const ORG_ID = 'hiero-contributors'
const WALLET_ID = `Organization_${ORG_ID}`
const DID = 'did:key:z6MkIssuer'
const ENDORSER_DID = 'did:indy:bcovrin:test:4bbYgjU6JbV4DShPbGoQcA'

const config: GithubConfig = { ...githubConfigDefaults, enabled: true, issuerOrgId: ORG_ID, issuerDid: DID }

const FIELDS = ['verifiedAt', 'githubAccountId', 'githubUsername', 'gpgFingerprint']

const sdJwtRegistration = (overrides: Record<string, unknown> = {}) => ({
  protocol: ProtocolType.Oid4vc,
  credentialFormat: OpenId4VCCredentialRegistrationFormat.SdJwtVc,
  did: DID,
  credentials: { supportedCredentialId: 'GitHub Contributor:key:vc+sd-jwt', statusListId: 'sl-1' },
  ...overrides,
})

function schemaWith(fields: string[], registrations: unknown[]) {
  return {
    fields: { getItems: () => fields.map((name) => ({ name })) },
    registrations: { getItems: () => registrations },
  }
}

describe('ContributorIssuerService', () => {
  let service: ContributorIssuerService
  let logger: Logger
  let getCreatedDids: ReturnType<typeof vi.fn>
  let agent: Agent
  let found: { wallet: unknown; schema: unknown }
  let em: { fork: ReturnType<typeof vi.fn>; findOne: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    getCreatedDids = vi.fn().mockResolvedValue([didRecordStub({ did: DID })])
    agent = {
      agencyConfig: { indyEndorserDid: ENDORSER_DID },
      modules: {
        tenants: {
          withTenantAgent: vi.fn(async (_options: unknown, callback: (t: unknown) => Promise<void>) =>
            callback({ dids: { getCreatedDids } }),
          ),
        },
      },
    } as unknown as Agent
    found = {
      wallet: { id: WALLET_ID, tenantId: 'tenant-org' },
      schema: schemaWith(FIELDS, [sdJwtRegistration()]),
    }
    em = {
      fork: vi.fn(() => em),
      findOne: vi.fn((entity: unknown) => (entity === Wallet ? found.wallet : entity === Schema ? found.schema : null)),
    }
    logger = createMock<Logger>()
    service = new ContributorIssuerService(agent, config, em as unknown as EntityManager, logger)
  })

  async function notSetUpMessage(): Promise<string> {
    const error: unknown = await service.resolveIssuer().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ServiceUnavailableException)
    return (error as ServiceUnavailableException).message
  }

  it("returns the organization wallet, DID and the registration's credential configuration", async () => {
    await expect(service.resolveIssuer()).resolves.toEqual({
      walletId: WALLET_ID,
      tenantId: 'tenant-org',
      did: DID,
      supportedCredentialId: 'GitHub Contributor:key:vc+sd-jwt',
      publicIssuerId: DID,
    })
    expect(em.findOne).toHaveBeenCalledWith(Wallet, { id: WALLET_ID })
    expect(em.findOne).toHaveBeenCalledWith(
      Schema,
      { owner: WALLET_ID, name: 'GitHub Contributor' },
      { populate: ['fields', 'registrations'] },
    )
    expect(getCreatedDids).toHaveBeenCalledWith({ did: DID })
  })

  it('checks again on every call, so a completed setup takes effect without a restart', async () => {
    found.wallet = null
    await expect(service.resolveIssuer()).rejects.toBeInstanceOf(ServiceUnavailableException)

    found.wallet = { id: WALLET_ID, tenantId: 'tenant-org' }
    await expect(service.resolveIssuer()).resolves.toMatchObject({ did: DID })
  })

  it('1. the organization wallet does not exist', async () => {
    found.wallet = null

    expect(await notSetUpMessage()).toBe(
      `The contributor credential issuer is not set up: the wallet of organization ${ORG_ID} does not exist yet. ` +
        'An OrgAdmin of the organization signs in once.',
    )
  })

  it.each([
    ['not created by the wallet', () => []],
    ['deactivated', () => [didRecordStub({ did: DID, getTag: (tag: string) => tag === DID_DEACTIVATED_TAG })]],
    ['the Indy endorser DID every tenant holds', () => [didRecordStub({ did: ENDORSER_DID })]],
  ])('2. the pinned DID is %s', async (_case, records) => {
    getCreatedDids.mockResolvedValue(records())

    expect(await notSetUpMessage()).toBe(
      `The contributor credential issuer is not set up: ${DID} is not an active DID of organization ${ORG_ID}. ` +
        'Create a DID in the organization and set CONTRIBUTOR_ISSUER_DID to it.',
    )
  })

  it('3. the organization has no "GitHub Contributor" schema', async () => {
    found.schema = null

    expect(await notSetUpMessage()).toBe(
      `The contributor credential issuer is not set up: organization ${ORG_ID} has no schema "GitHub Contributor". ` +
        'Create it with the fields githubAccountId, githubUsername, gpgFingerprint, verifiedAt.',
    )
  })

  it.each([
    [['githubAccountId', 'githubUsername', 'gpgFingerprint'], 'githubAccountId, githubUsername, gpgFingerprint'],
    [[...FIELDS, 'walletId'], 'githubAccountId, githubUsername, gpgFingerprint, verifiedAt, walletId'],
    [[], '(none)'],
  ])('3. the schema has other fields: %j', async (fields, listed) => {
    found.schema = schemaWith(fields, [sdJwtRegistration()])

    expect(await notSetUpMessage()).toBe(
      `The contributor credential issuer is not set up: the schema "GitHub Contributor" has the fields ${listed}; ` +
        'it needs exactly githubAccountId, githubUsername, gpgFingerprint, verifiedAt. Create a schema with those fields.',
    )
  })

  it.each([
    ['no registration', []],
    ['a registration on another DID', [sdJwtRegistration({ did: 'did:key:z6MkOther' })]],
    ['a registration of another format', [sdJwtRegistration({ credentialFormat: 'jwt_vc_json' })]],
    ['an Aries registration', [sdJwtRegistration({ protocol: ProtocolType.Aries })]],
  ])('4. the schema has %s for vc+sd-jwt on the pinned DID', async (_case, registrations) => {
    found.schema = schemaWith(FIELDS, registrations)

    expect(await notSetUpMessage()).toBe(
      `The contributor credential issuer is not set up: the schema "GitHub Contributor" is not registered for ` +
        `OpenID4VC vc+sd-jwt on ${DID}. Register it there.`,
    )
  })

  describe('at startup', () => {
    it('logs one info line when the setup is complete', async () => {
      await service.onApplicationBootstrap()

      expect(logger.info).toHaveBeenCalledWith(
        `The contributor credential issuer is set up: ${DID} in wallet ${WALLET_ID}`,
      )
      expect(logger.warn).not.toHaveBeenCalled()
    })

    it('logs one warning with what is missing, and does not fail the start', async () => {
      found.schema = null

      await expect(service.onApplicationBootstrap()).resolves.toBeUndefined()
      expect(logger.warn).toHaveBeenCalledOnce()
      expect(vi.mocked(logger.warn).mock.calls[0][0]).toContain('has no schema "GitHub Contributor"')
    })

    it('does not fail the start on an unexpected error either', async () => {
      em.findOne.mockRejectedValue(new Error('database down'))

      await expect(service.onApplicationBootstrap()).resolves.toBeUndefined()
      expect(logger.warn).toHaveBeenCalledWith('database down')
    })
  })
})
