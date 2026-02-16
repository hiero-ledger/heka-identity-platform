import { DidDocument } from '@credo-ts/core'
import { PublicJwk } from '@credo-ts/core/build/modules/kms'
import { EntityManager } from '@mikro-orm/core'
import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { ConfigType } from '@nestjs/config'

import { Agent, AGENT_TOKEN, TenantAgent } from 'common/agent'
import { AuthInfo } from 'common/auth'
import { DidRegistrarService } from 'common/did-registrar'
import { Wallet } from 'common/entities'
import { InjectLogger, Logger } from 'common/logger'
import { getDidControllerWalletId } from 'utils/auth'
import { withTenantAgent } from 'utils/multi-tenancy'

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

    const wallet = await this.em.findOneOrFail(Wallet, { id: authInfo.walletId })
    if (wallet.publicDid) {
      throw new Error(`The wallet already contains created public DID: ${wallet.publicDid}`)
    }

    let didDocument: DidDocument

    const didControllerWalletId = getDidControllerWalletId({
      role: authInfo.role,
      orgId: authInfo.orgId,
    })

    logger.info(`DID subject wallet ID: ${authInfo.walletId}`)
    logger.info(`DID controller wallet ID: ${didControllerWalletId ?? 'N/A'}`)

    if (didControllerWalletId) {
      const didControllerWallet = await this.em.findOne(Wallet, {
        id: didControllerWalletId,
      })
      if (!didControllerWallet || !didControllerWallet.publicDid) {
        throw new UnprocessableEntityException(
          `Public DID created by ${didControllerWalletId} is required in order to be set as controller but it has not been created yet`,
        )
      }

      const controller = didControllerWallet.publicDid

      const key = await withTenantAgent(
        {
          agent: this.agent,
          tenantId: authInfo.tenantId,
        },
        async (tenantAgent) => {
          return await tenantAgent.kms.createKey({
            type: {
              crv: 'Ed25519',
              kty: 'OKP',
            },
          })
        },
      )

      logger.info('Key was created by DID subject')

      const publicKey = PublicJwk.fromPublicJwk(key.publicJwk).publicKey.publicKey
      didDocument = await this.didRegistrarService.createDid(didControllerWallet.tenantId, req.method, {
        namespace: this.agent.agencyConfig.networks[0].indyNamespace,
        controller,
        publicKey,
      })

      logger.info(`DID document creation by DID controller result: ${JSON.stringify(didDocument)}`)

      await withTenantAgent(
        {
          agent: this.agent,
          tenantId: authInfo.tenantId,
        },
        async (tenantAgent) => {
          // TODO: Check and fix if required the next line. didDocument.verificationMethod![0].id can be undefined.
          const didDocumentRelativeKeyId = didDocument.verificationMethod![0].id
          return await tenantAgent.dids.import({
            did: didDocument.id,
            didDocument,
            keys: [
              {
                kmsKeyId: key.keyId,
                didDocumentRelativeKeyId,
              },
            ],
          })
        },
      )

      logger.info('DID document was imported by DID subject')
    } else {
      didDocument = await this.didRegistrarService.createDid(authInfo.tenantId, req.method, {
        namespace: this.agent.agencyConfig.networks[0].indyNamespace,
      })
    }

    // wallet.publicDid = didDocument.id
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
