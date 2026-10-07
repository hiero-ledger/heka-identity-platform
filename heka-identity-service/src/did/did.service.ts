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
import { Mutex } from 'async-mutex'

import { Agent, AGENT_TOKEN, TenantAgent } from 'common/agent'
import { AuthInfo } from 'common/auth'
import { AuthorizationService } from 'common/authz'
import { DidRegistrarService } from 'common/did-registrar'
import { Wallet } from 'common/entities'
import { InjectLogger, Logger } from 'common/logger'
import { MAIN_DID_METHOD } from 'common/types'
import { getDidControllerWalletId } from 'utils/auth'
import { withTenantAgent } from 'utils/multi-tenancy'

import AgentConfig from '../config/agent'

import { CreateDidRequestDto, DidDocumentDto, FindDidRequestDto, GetDidMethodsResponseDto } from './dto'

@Injectable()
export class DidService {
  private readonly mainDidMutex = new Mutex()

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

    const method = req.method ?? MAIN_DID_METHOD

    const run = async () => {
      // 1. `Wallet.publicDid` is the main-method DID, so only that method is limited to one per wallet.
      // The wallet is re-read so a main DID persisted by a concurrent request is observed
      const wallet = await this.em.findOneOrFail(Wallet, { id: authInfo.walletId }, { refresh: true })
      if (method === MAIN_DID_METHOD && wallet.publicDid) {
        throw new ConflictException(`The wallet already contains created public DID: ${wallet.publicDid}`)
      }

      // 2. With the role model enabled, the new DID is controlled by the DID of the same method held by the
      // controller wallet (Admin -> OrgAdmin -> Issuer), for methods that support a controller. Roles that cannot
      // create a public DID are rejected here as well
      let controller: string | undefined
      if (this.authorizationService.isEnforced) {
        const didControllerWalletId = getDidControllerWalletId({ role: authInfo.role, orgId: authInfo.orgId })
        if (didControllerWalletId && this.didRegistrarService.supportsController(method)) {
          controller = await this.findCreatedDid(didControllerWalletId, method)
          if (!controller) {
            throw new UnprocessableEntityException(
              `A ${method} DID created by ${didControllerWalletId} is required in order to be set as controller but it has not been created yet`,
            )
          }
          logger.info(`DID controller: ${controller}`)
        }
      }

      // 3. Unsupported methods are rejected by the registrar
      const didDocument = await this.didRegistrarService.createDid(authInfo.tenantId, method, {
        namespace: this.agent.agencyConfig.networks[0].indyNamespace,
        controller,
      })

      if (method === MAIN_DID_METHOD) {
        wallet.publicDid = didDocument.id
      }
      await this.em.flush()
      return didDocument
    }

    // The main-method DID check, creation and write are serialized, so concurrent requests cannot both create one
    const didDocument = method === MAIN_DID_METHOD ? await this.mainDidMutex.runExclusive(run) : await run()

    const res = new DidDocumentDto(didDocument)

    logger.trace('<')
    return res
    /* jscpd:ignore-end */
  }

  private async findCreatedDid(walletId: string, method: string): Promise<string | undefined> {
    const wallet = await this.em.findOne(Wallet, { id: walletId })
    if (!wallet) {
      return undefined
    }
    const didRecords = await withTenantAgent({ agent: this.agent, tenantId: wallet.tenantId }, (tenantAgent) =>
      tenantAgent.dids.getCreatedDids({ method }),
    )
    return didRecords[0]?.did
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
