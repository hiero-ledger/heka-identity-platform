import { DidCommModuleConfig, DidCommOutOfBandInvitation, DidCommOutOfBandRecord, DidCommOutOfBandRole } from '@credo-ts/didcomm'
import { EntityManager, MikroORM, UseRequestContext } from '@mikro-orm/core'
import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common'

import { Wallet } from 'common/entities'
import { InjectLogger, Logger } from 'common/logger'
import { withTenantAgent } from 'utils/multi-tenancy'

import { Agent, AGENT_TOKEN } from './agent.provider'

const MEDIATOR_LABEL = 'Mediator'
const MEDIATOR_PROVISION_GOAL = 'mediator-provision'
const MEDIATOR_WALLET_ID = 'CredoMediator'

@Injectable()
export class MediatorService implements OnApplicationBootstrap {
  public constructor(
    @Inject(AGENT_TOKEN)
    private readonly agent: Agent,
    // @ts-ignore: The property is used by @UseRequestContext
    // See https://mikro-orm.io/docs/identity-map#userequestcontext-decorator
    private readonly orm: MikroORM,
    private readonly em: EntityManager,
    @InjectLogger(MediatorService)
    private readonly logger: Logger,
  ) {
    this.logger.child('constructor').trace('<>')
  }

  @UseRequestContext()
  public async onApplicationBootstrap() {
    const logger = this.logger.child('onApplicationBootstrap')
    logger.trace('>')

    // Mediator functionality will be enabled only if autoAcceptMediationRequests is true
    if (!this.agent.agencyConfig.autoAcceptMediationRequests) {
      logger.info('Mediator is turned off in agent config')
      return
    }

    const mediatorWallet = await this.ensureMediatorWallet()
    await this.setUpMediator(mediatorWallet.tenantId)

    logger.trace('<')
  }

  private async ensureMediatorWallet() {
    const logger = this.logger.child('ensureMediatorWallet')
    logger.trace('>')

    let wallet = await this.em.findOne(Wallet, { id: MEDIATOR_WALLET_ID })

    if (!wallet) {
      const mediatorTenantRecord = await this.agent.modules.tenants.createTenant({
        config: { label: MEDIATOR_LABEL },
      })

      wallet = new Wallet({
        id: MEDIATOR_WALLET_ID,
        tenantId: mediatorTenantRecord.id,
      })

      await this.em.persistAndFlush(wallet)
      logger.info('Created mediator wallet')
    } else {
      logger.info('Found existing mediator wallet')
    }

    logger.trace('<')
    return wallet
  }

  private async setUpMediator(mediatorTenantId: string) {
    const logger = this.logger.child('setUpMediator')
    logger.trace('>')

    await withTenantAgent(
      {
        agent: this.agent,
        tenantId: mediatorTenantId,
      },
      async (mediatorTenantAgent) => {
        const existingOutOfBandRecords = await mediatorTenantAgent.modules.oob.findAllByQuery({
          role: DidCommOutOfBandRole.Sender,
        })

        let mediatorOutOfBandRecord = existingOutOfBandRecords.find(
          (record: DidCommOutOfBandRecord) => record.reusable && record.outOfBandInvitation.goal === MEDIATOR_PROVISION_GOAL,
        )

        if (mediatorOutOfBandRecord) {
          const invitationUrl = this.convertOutOfBandInvitationToUrl(mediatorOutOfBandRecord.outOfBandInvitation)
          logger.info(`Found existing mediator invitation: ${invitationUrl}`)
        } else {
          mediatorOutOfBandRecord = await mediatorTenantAgent.modules.oob.createInvitation({
            label: MEDIATOR_LABEL,
            goal: MEDIATOR_PROVISION_GOAL,
            multiUseInvitation: true,
          })
          const invitationUrl = this.convertOutOfBandInvitationToUrl(mediatorOutOfBandRecord.outOfBandInvitation)
          logger.info(`Created mediator invitation: ${invitationUrl}`)
        }
      },
    )

    logger.trace('<')
  }

  private convertOutOfBandInvitationToUrl(invitation: DidCommOutOfBandInvitation) {
    const didcommConfig = this.agent.dependencyManager.resolve(DidCommModuleConfig)
    return invitation.toUrl({
      domain: didcommConfig.endpoints[0],
    })
  }
}
