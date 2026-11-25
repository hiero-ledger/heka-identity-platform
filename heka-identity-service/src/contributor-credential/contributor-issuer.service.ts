import { EntityManager } from '@mikro-orm/core'
import { Inject, Injectable, OnApplicationBootstrap, ServiceUnavailableException } from '@nestjs/common'
import { ConfigType } from '@nestjs/config'

import { Agent, AGENT_TOKEN } from 'common/agent'
import { isDidRecordDeactivated } from 'common/did-registrar'
import { Schema, Wallet } from 'common/entities'
import { InjectLogger, Logger } from 'common/logger'
import { OpenId4VCCredentialRegistrationFormat, ProtocolType } from 'common/types'
import { OID4VCRegistrationCredentials } from 'common/types/registration-credentials'
import GithubConfig from 'config/github'
import { getOrganizationWalletId } from 'utils/auth'
import { withTenantAgent } from 'utils/multi-tenancy'

import { CONTRIBUTOR_SCHEMA_FIELDS, CONTRIBUTOR_SCHEMA_NAME } from './contributor-credential.constants'
import { ContributorIssuer } from './contributor-credential.types'

function notSetUp(what: string): never {
  throw new ServiceUnavailableException(`The contributor credential issuer is not set up: ${what}`)
}

/**
 * The organization issuer of the contributor credential, set up by an OrgAdmin through the normal UI
 * (docs/runbooks/issuer-setup.md). Nothing is written here: the setup is only checked.
 */
@Injectable()
export class ContributorIssuerService implements OnApplicationBootstrap {
  public constructor(
    @Inject(AGENT_TOKEN) private readonly agent: Agent,
    @Inject(GithubConfig.KEY) private readonly config: ConfigType<typeof GithubConfig>,
    private readonly em: EntityManager,
    @InjectLogger(ContributorIssuerService) private readonly logger: Logger,
  ) {}

  /** Reports the setup at startup; an incomplete setup doesn't stop the service. */
  public async onApplicationBootstrap(): Promise<void> {
    try {
      const issuer = await this.resolveIssuer()
      this.logger.info(`The contributor credential issuer is set up: ${issuer.did} in wallet ${issuer.walletId}`)
    } catch (error) {
      this.logger.warn(error instanceof Error ? error.message : String(error))
    }
  }

  /**
   * Checks the setup on every call, so a fixed setup takes effect without a restart.
   *
   * @throws {ServiceUnavailableException} The first missing piece, and what to do about it.
   */
  public async resolveIssuer(): Promise<ContributorIssuer> {
    const orgId = this.config.issuerOrgId!
    const did = this.config.issuerDid!
    const walletId = getOrganizationWalletId(orgId)
    const em = this.em.fork()

    const wallet = await em.findOne(Wallet, { id: walletId })
    if (!wallet) {
      notSetUp(`the wallet of organization ${orgId} does not exist yet. An OrgAdmin of the organization signs in once.`)
    }

    const ownDid = await withTenantAgent({ agent: this.agent, tenantId: wallet.tenantId }, async (tenantAgent) => {
      const records = await tenantAgent.dids.getCreatedDids({ did })
      // Every tenant holds the Indy endorser DID; it is not the organization's own
      return records.some(
        (record) => record.did !== this.agent.agencyConfig.indyEndorserDid && !isDidRecordDeactivated(record),
      )
    })
    if (!ownDid) {
      notSetUp(
        `${did} is not an active DID of organization ${orgId}. Create a DID in the organization and set CONTRIBUTOR_ISSUER_DID to it.`,
      )
    }

    const schema = await em.findOne(
      Schema,
      { owner: walletId, name: CONTRIBUTOR_SCHEMA_NAME },
      { populate: ['fields', 'registrations'] },
    )
    if (!schema) {
      notSetUp(
        `organization ${orgId} has no schema "${CONTRIBUTOR_SCHEMA_NAME}". Create it with the fields ${CONTRIBUTOR_SCHEMA_FIELDS.join(', ')}.`,
      )
    }

    const fields = schema.fields
      .getItems()
      .map((field) => field.name)
      .sort()
    if (fields.join() !== [...CONTRIBUTOR_SCHEMA_FIELDS].sort().join()) {
      notSetUp(
        `the schema "${CONTRIBUTOR_SCHEMA_NAME}" has the fields ${fields.join(', ') || '(none)'}; it needs exactly ${CONTRIBUTOR_SCHEMA_FIELDS.join(', ')}. Create a schema with those fields.`,
      )
    }

    const registration = schema.registrations
      .getItems()
      .find(
        (candidate) =>
          candidate.protocol === ProtocolType.Oid4vc &&
          candidate.credentialFormat === OpenId4VCCredentialRegistrationFormat.SdJwtVc &&
          candidate.did === did,
      )
    const supportedCredentialId = (registration?.credentials as OID4VCRegistrationCredentials | undefined)
      ?.supportedCredentialId
    if (!supportedCredentialId) {
      notSetUp(
        `the schema "${CONTRIBUTOR_SCHEMA_NAME}" is not registered for OpenID4VC ${OpenId4VCCredentialRegistrationFormat.SdJwtVc} on ${did}. Register it there.`,
      )
    }

    return { walletId, tenantId: wallet.tenantId, did, supportedCredentialId, publicIssuerId: did }
  }
}
