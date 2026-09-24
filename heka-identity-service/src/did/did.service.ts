import { EntityManager } from '@mikro-orm/core'
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { ConfigType } from '@nestjs/config'

import { Agent, AGENT_TOKEN, TenantAgent } from 'common/agent'
import { AuthInfo } from 'common/auth'
import { AuthorizationService, Capability } from 'common/authz'
import { DidRegistrarService } from 'common/did-registrar'
import { Wallet } from 'common/entities'
import { InjectLogger, Logger } from 'common/logger'
import { MAIN_DID_METHOD } from 'common/types'
import { getDidControllerWalletId } from 'utils/auth'

import AgentConfig from '../config/agent'

import { CreateDidRequestDto, DidDocumentDto, FindDidRequestDto, GetDidMethodsResponseDto } from './dto'

@Injectable()
export class DidService {
  public constructor(
    @Inject(AGENT_TOKEN)
    private readonly agent: Agent,
    private readonly em: EntityManager,
    @InjectLogger(DidService)
    private readonly logger: Logger,
    private readonly didRegistrarService: DidRegistrarService,
    @Inject(AgentConfig.KEY)
    private readonly agentConfig: ConfigType<typeof AgentConfig>,
    private readonly authorizationService: AuthorizationService,
  ) {
    this.logger.child('constructor').trace('<>')
  }

  public async find(tenantAgent: TenantAgent, req: FindDidRequestDto): Promise<DidDocumentDto[]> {
    const logger = this.logger.child('find', req)
    logger.trace('>')

    if (!req.own) {
      throw new BadRequestException('Bulk retrieval is supported for own DIDs of the user only')
    }

    const didRecords = await tenantAgent.dids.getCreatedDids({
      method: req.method,
    })

    const res = await Promise.all(
      didRecords
        .filter((record) => record.did !== this.agent.agencyConfig.indyEndorserDid) // exclude endorser DID
        .map(async (record) => {
          if (record.didDocument) {
            return record.didDocument
          }
          return await tenantAgent.dids.resolveDidDocument(record.did)
        }),
    )

    logger.trace('<')
    return res
  }

  public async create(authInfo: AuthInfo, req: CreateDidRequestDto): Promise<DidDocumentDto> {
    /* jscpd:ignore-start */
    const logger = this.logger.child('create')
    logger.trace('>')

    // 1. Only roles with the `did` capability may create a public DID
    this.authorizationService.assert(authInfo, Capability.Did)

    // 2. `Wallet.publicDid` is the main-method DID, so only that method is limited to one per wallet
    const method = req.method ?? MAIN_DID_METHOD
    const wallet = await this.em.findOneOrFail(Wallet, { id: authInfo.walletId })
    if (method === MAIN_DID_METHOD && wallet.publicDid) {
      throw new ConflictException(`The wallet already contains created public DID: ${wallet.publicDid}`)
    }

    // 3. The controller's public DID must exist first. It only orders the hierarchy: the DID is
    // always created in the caller's own wallet
    if (this.authorizationService.isEnforced) {
      const didControllerWalletId = getDidControllerWalletId({ role: authInfo.role, orgId: authInfo.orgId })
      logger.info(`DID controller wallet ID: ${didControllerWalletId ?? 'N/A'}`)

      if (didControllerWalletId) {
        const didControllerWallet = await this.em.findOne(Wallet, { id: didControllerWalletId })
        if (!didControllerWallet?.publicDid) {
          throw new UnprocessableEntityException(
            `Public DID created by ${didControllerWalletId} is required in order to be set as controller but it has not been created yet`,
          )
        }
      }
    }

    // 4. Unsupported methods are rejected by the registrar
    const didDocument = await this.didRegistrarService.createDid(authInfo.tenantId, method, {
      namespace: this.agent.agencyConfig.networks[0].indyNamespace,
    })

    if (method === MAIN_DID_METHOD) {
      wallet.publicDid = didDocument.id
    }
    await this.em.flush()

    const res = new DidDocumentDto(didDocument)

    logger.trace('<')
    return res
    /* jscpd:ignore-end */
  }

  public async get(tenantAgent: TenantAgent, did: string): Promise<DidDocumentDto> {
    const logger = this.logger.child('get')
    logger.trace('>')

    const didResolutionResult = await tenantAgent.dids.resolve(did)

    logger.info(`DID Resolution result: ${JSON.stringify(didResolutionResult)}`)

    const {
      didDocument,
      didResolutionMetadata: { error, message },
    } = didResolutionResult

    if (!didDocument) {
      switch (error) {
        case 'notFound':
          throw new NotFoundException(`DID not found`)
        case 'unsupportedDidMethod':
        case 'invalidDid':
          throw new BadRequestException(`Unable to resolve DID document for DID '${did}': ${error} ${message}`)
        default:
          throw new InternalServerErrorException(`Unable to resolve DID document for DID '${did}': ${error} ${message}`)
      }
    }

    const res = new DidDocumentDto(didDocument)

    logger.trace('<')
    return res
  }

  public getMethods(): GetDidMethodsResponseDto {
    const logger = this.logger.child('getMethods')
    logger.trace('>')

    const res = new GetDidMethodsResponseDto(this.agentConfig.didMethods)

    logger.trace('<')
    return res
  }
}
