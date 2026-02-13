import { EntityManager } from '@mikro-orm/core'
import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  OnApplicationBootstrap,
} from '@nestjs/common'
import { ConfigType } from '@nestjs/config'

import AgentConfig from '../../config/agent'
import { withTenantAgent } from '../../utils/multi-tenancy'
import { Agent, AGENT_TOKEN } from '../agent'
import { Wallet } from '../entities'

import { CreateDidOptions, DidRegistrar } from './did-registrar.types'
import { DidIndyRegistrar, DidKeyRegistrar, DidIndyBesuRegistrar, DidHederaRegistrar } from './methods'

const DID_REGISTRAR_WALLET_ID = 'DidRegistrarWallet'
const DID_REGISTRAR_TENANT_LABEL = 'DidRegistrarTenant'

@Injectable()
export class DidRegistrarService implements OnApplicationBootstrap {
  private readonly registrars!: Record<string, DidRegistrar>
  // @ts-ignore
  private tenantId!: string // FIXME: Currently unused but in future we want all DID to be created from separated tenant
  private readonly em!: EntityManager

  public constructor(
    @Inject(AGENT_TOKEN) private readonly agent: Agent,
    @Inject(AgentConfig.KEY) agencyConfig: ConfigType<typeof AgentConfig>,
    em: EntityManager,
  ) {
    this.registrars = {}
    this.em = em.fork()

    for (const method of agencyConfig.didMethods) {
      switch (method) {
        case DidIndyRegistrar.method: {
          this.registrars[DidIndyRegistrar.method] = new DidIndyRegistrar(agencyConfig)
          break
        }
        case DidKeyRegistrar.method: {
          this.registrars[DidKeyRegistrar.method] = new DidKeyRegistrar()
          break
        }
        case DidIndyBesuRegistrar.method: {
          this.registrars[DidIndyBesuRegistrar.method] = new DidIndyBesuRegistrar(agencyConfig)
          break
        }
        case DidHederaRegistrar.method: {
          this.registrars[DidHederaRegistrar.method] = new DidHederaRegistrar()
          break
        }
        default:
          throw new BadRequestException(`DID Method '${method}' is not supported`)
      }
    }
  }

  public async onApplicationBootstrap() {
    this.tenantId = await this.initTenant()
  }

  public getDidRegistrar(method?: string): DidRegistrar {
    const register = this.registrars[method ?? DidKeyRegistrar.method]
    if (!register) {
      throw new BadRequestException(`DID Method '${method}' is not supported`)
    }
    return register
  }

  public async createDid(tenantId: string, method: string = DidKeyRegistrar.method, options: CreateDidOptions) {
    const didRegistrar = this.getDidRegistrar(method)

    const didCreateResult = await withTenantAgent(
      {
        agent: this.agent,
        tenantId,
      },
      async (tenantAgent) => {
        return await didRegistrar.createDid(tenantAgent, options)
      },
    )

    const { didState } = didCreateResult
    if (didState.state !== 'finished') {
      throw new InternalServerErrorException(
        `DID document was not created: ${didState.state === 'failed' ? didState.reason : 'Not finished'}`,
      )
    }

    return didState.didDocument
  }

  private async initTenant(): Promise<string> {
    let wallet = await this.em.findOne(Wallet, { id: DID_REGISTRAR_WALLET_ID })
    if (wallet) {
      return wallet.tenantId
    }

    const didRegistrarTenant = await this.agent.modules.tenants.createTenant({
      config: { label: DID_REGISTRAR_TENANT_LABEL },
    })

    wallet = new Wallet({
      id: DID_REGISTRAR_WALLET_ID,
      tenantId: didRegistrarTenant.id,
    })

    await this.em.persistAndFlush(wallet)

    return wallet.tenantId
  }
}
