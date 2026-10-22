import type { DidDocument } from '@credo-ts/core'

import { EntityManager } from '@mikro-orm/core'
import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  OnApplicationBootstrap,
  UnprocessableEntityException,
} from '@nestjs/common'
import { ConfigType } from '@nestjs/config'

import AgentConfig from '../../config/agent'
import { withTenantAgent } from '../../utils/multi-tenancy'
import { Agent, AGENT_TOKEN, TenantAgent } from '../agent'
import { Wallet } from '../entities'

import { CreateDidOptions, DidRegistrar, UpdateDidOptions } from './did-registrar.types'
import { DidIndyRegistrar, DidKeyRegistrar, DidIndyBesuRegistrar, DidHederaRegistrar } from './methods'

const DID_REGISTRAR_WALLET_ID = 'DidRegistrarWallet'
const DID_REGISTRAR_TENANT_LABEL = 'DidRegistrarTenant'

// Why DIDs of a method cannot be updated or deactivated through the Identity Service. jwk, peer and web have no
// registrar wrapper at all, so their DIDs are rejected without one
const NOT_UPDATABLE_REASONS: Record<string, string> = {
  key: 'did:key DIDs are immutable and cannot be updated or deactivated',
  jwk: 'did:jwk DIDs are immutable and cannot be updated or deactivated',
  indy: 'did:indy update and deactivation are not implemented yet',
  peer: 'did:peer update and deactivation are not implemented yet; DIDComm connection DIDs are not managed here',
  web: 'did:web DIDs are not hosted by the Identity Service and cannot be updated or deactivated by it',
}
const UNMANAGED_METHODS = ['jwk', 'peer', 'web']

type DidOperation = 'update' | 'deactivate'

@Injectable()
export class DidRegistrarService implements OnApplicationBootstrap {
  private readonly registrars!: Record<string, DidRegistrar>
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
    // Initialize the DID registrar tenant. The tenant record is not currently
    // consumed, but will be used when DID creation moves to a dedicated tenant.
    await this.initTenant()
  }

  public getDidRegistrar(method?: string): DidRegistrar {
    const register = this.registrars[method ?? DidKeyRegistrar.method]
    if (!register) {
      throw new BadRequestException(`DID Method '${method}' is not supported`)
    }
    return register
  }

  public supportsController(method: string = DidKeyRegistrar.method): boolean {
    return this.getDidRegistrar(method).supportsController
  }

  /**
   * The registrar of a method that can update (or deactivate) DIDs. Methods that cannot are rejected with 422 and the
   * reason; methods that are not configured with 400, as on creation.
   */
  public getUpdatingDidRegistrar(method: string, operation: DidOperation): DidRegistrar {
    if (UNMANAGED_METHODS.includes(method)) {
      throw new UnprocessableEntityException(NOT_UPDATABLE_REASONS[method])
    }
    const didRegistrar = this.getDidRegistrar(method)
    const supported = operation === 'update' ? didRegistrar.supportsUpdate : didRegistrar.supportsDeactivate
    if (!supported) {
      throw new UnprocessableEntityException(
        NOT_UPDATABLE_REASONS[method] ??
          `did:${method} DIDs cannot be ${operation === 'update' ? 'updated' : 'deactivated'}`,
      )
    }
    return didRegistrar
  }

  // Configured methods only: an unknown method is not supported at all (400)
  public supportsUpdate(method: string): boolean {
    return this.getDidRegistrar(method).supportsUpdate
  }

  public supportsDeactivate(method: string): boolean {
    return this.getDidRegistrar(method).supportsDeactivate
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

  // Unlike creation, these run in the caller's tenant agent session: the DID record they change was read through it
  public async updateDid(tenantAgent: TenantAgent, method: string, options: UpdateDidOptions): Promise<DidDocument> {
    const didRegistrar = this.getUpdatingDidRegistrar(method, 'update')

    const { didState } = await didRegistrar.updateDid!(tenantAgent, options)
    if (didState.state !== 'finished') {
      throw new InternalServerErrorException(
        `DID document was not updated: ${didState.state === 'failed' ? didState.reason : 'Not finished'}`,
      )
    }

    return didState.didDocument
  }

  public async deactivateDid(tenantAgent: TenantAgent, method: string, did: string): Promise<DidDocument> {
    const didRegistrar = this.getUpdatingDidRegistrar(method, 'deactivate')

    const { didState } = await didRegistrar.deactivateDid!(tenantAgent, did)
    if (didState.state !== 'finished') {
      throw new InternalServerErrorException(
        `DID document was not deactivated: ${didState.state === 'failed' ? didState.reason : 'Not finished'}`,
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

    this.em.persist(wallet)
    await this.em.flush()

    return wallet.tenantId
  }
}
