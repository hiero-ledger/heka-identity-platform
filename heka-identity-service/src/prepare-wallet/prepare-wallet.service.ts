import { EntityManager } from '@mikro-orm/core'
import { ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { ConfigType } from '@nestjs/config'

import { TenantAgent } from 'common/agent'
import { AuthInfo } from 'common/auth'
import { Schema, Wallet } from 'common/entities'
import { InjectLogger, Logger } from 'common/logger'
import { credentialFormatToCredentialRegistrationFormat, MAIN_DID_METHOD } from 'common/types'
import { WalletLockService } from 'common/wallet-lock'
import PrepareWalletConfig from 'config/prepare-wallet'
import { DidService } from 'did/did.service'
import { OpenId4VcIssuerService } from 'openid4vc/issuer/issuer.service'
import { OpenId4VcVerifierService } from 'openid4vc/verifier/verifier.service'
import {
  PreparedDidDto,
  PreparedDidStatus,
  PrepareWalletRequestDto,
  PrepareWalletResponseDto,
} from 'prepare-wallet/dto/prepare-wallet.dto'
import { SchemaV2Service } from 'schema-v2/schema-v2.service'
import { UserService } from 'user/user.service'

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

@Injectable()
export class PrepareWalletService {
  // A string: the configured methods and the registration networks are compared with it
  private static mainDidMethod: string = MAIN_DID_METHOD
  private static defaultColor = '#f58529'

  public constructor(
    @InjectLogger(PrepareWalletService)
    private readonly logger: Logger,
    private readonly em: EntityManager,
    private readonly didService: DidService,
    private readonly openId4VcIssuerService: OpenId4VcIssuerService,
    private readonly openId4VcVerifierService: OpenId4VcVerifierService,
    private readonly schemaV2Service: SchemaV2Service,
    private readonly userService: UserService,
    private readonly walletLockService: WalletLockService,
    @Inject(PrepareWalletConfig.KEY)
    private readonly config: ConfigType<typeof PrepareWalletConfig>,
  ) {}

  /**
   * Prepares the caller's wallet: a DID of every enabled method with its OID4VC issuer and verifier, the profile, and
   * the requested schemas. Calls for one wallet run one at a time, on every instance, so a concurrent caller waits and
   * then finds the wallet fully prepared. A repeated call creates whatever is still missing.
   */
  public async prepareWallet(
    authInfo: AuthInfo,
    tenantAgent: TenantAgent,
    req: PrepareWalletRequestDto,
    schemaLogo?: Express.Multer.File,
    userLogo?: Express.Multer.File,
  ): Promise<PrepareWalletResponseDto> {
    return await this.walletLockService.runExclusive(authInfo.walletId, this.config.lockTimeout, () =>
      this.prepareLocked(authInfo, tenantAgent, req, schemaLogo, userLogo),
    )
  }

  private async prepareLocked(
    authInfo: AuthInfo,
    tenantAgent: TenantAgent,
    req: PrepareWalletRequestDto,
    schemaLogo?: Express.Multer.File,
    userLogo?: Express.Multer.File,
  ): Promise<PrepareWalletResponseDto> {
    const logger = this.logger.child('prepareWallet', { req })
    logger.trace('>')

    const wallet = await this.em.findOneOrFail(Wallet, { id: authInfo.walletId }, { refresh: true })
    const firstPreparation = !wallet.publicDid
    if (!firstPreparation) {
      logger.info(`Wallet ${authInfo.walletId} already prepared; creating what is missing`)
    }

    // The main DID is required, so it comes first: if it fails, no other DID or OID4VC record is left behind
    const methods = this.didService.getMethods().methods
    const orderedMethods = [
      ...methods.filter((method) => method === PrepareWalletService.mainDidMethod),
      ...methods.filter((method) => method !== PrepareWalletService.mainDidMethod),
    ]
    const dids: PreparedDidDto[] = []
    for (const method of orderedMethods) {
      const prepared = await this.prepareDid(authInfo, tenantAgent, method, wallet.publicDid)
      if (prepared.status === PreparedDidStatus.Failed) {
        logger.error(`Failed to prepare the ${method} DID of wallet ${authInfo.walletId}: ${prepared.error}`)
      }
      dids.push(prepared)
    }

    const mainDid = dids[0]?.did
    if (!mainDid) {
      throw new Error(`Failed to create DID for main method ${PrepareWalletService.mainDidMethod}`)
    }

    if (firstPreparation) {
      await this.userService.patchMe(
        authInfo,
        tenantAgent,
        {
          name: authInfo.userName,
          backgroundColor: PrepareWalletService.defaultColor,
        },
        userLogo,
      )
    }

    if (req.schemas) {
      await this.prepareSchemas(authInfo, tenantAgent, req, dids, schemaLogo)
    }

    logger.info(`Prepared wallet with main method DID: ${mainDid}`)
    logger.trace('<')
    return new PrepareWalletResponseDto({ did: mainDid, dids })
  }

  /** The wallet's DID of one method, created if missing, with its OID4VC issuer and verifier. */
  private async prepareDid(
    authInfo: AuthInfo,
    tenantAgent: TenantAgent,
    method: string,
    publicDid: string | undefined,
  ): Promise<PreparedDidDto> {
    const isMain = method === PrepareWalletService.mainDidMethod

    let did: string | undefined
    try {
      did = isMain ? publicDid : await this.didService.findOwnDid(tenantAgent, method)
    } catch (error) {
      return { method, status: PreparedDidStatus.Failed, error: `DID lookup: ${errorMessage(error)}` }
    }
    let status = PreparedDidStatus.Existing
    if (!did) {
      try {
        did = (await this.didService.create(authInfo, { method })).id
        status = PreparedDidStatus.Created
      } catch (error) {
        if (isMain) {
          // Another instance created the main DID through `POST /dids` in the meantime
          if (error instanceof ConflictException) {
            const { publicDid: concurrent } = await this.em.findOneOrFail(
              Wallet,
              { id: authInfo.walletId },
              { refresh: true },
            )
            if (concurrent) return await this.withOid4VcRecords(tenantAgent, method, concurrent, status)
          }
          // The main DID is required, so the reason it failed (e.g. 422) is returned as is
          throw error
        }
        return {
          method,
          status: error instanceof ForbiddenException ? PreparedDidStatus.Skipped : PreparedDidStatus.Failed,
          error: errorMessage(error),
        }
      }
    }
    return await this.withOid4VcRecords(tenantAgent, method, did, status)
  }

  /** Creates the OID4VC issuer and verifier of a DID unless they exist. */
  private async withOid4VcRecords(
    tenantAgent: TenantAgent,
    method: string,
    did: string,
    status: PreparedDidStatus,
  ): Promise<PreparedDidDto> {
    try {
      if (!(await this.openId4VcIssuerService.find(tenantAgent, did)).length) {
        await this.openId4VcIssuerService.createIssuer(tenantAgent, { publicIssuerId: did, credentialsSupported: [] })
      }
      if (!(await this.openId4VcVerifierService.find(tenantAgent, did)).length) {
        await this.openId4VcVerifierService.createVerifier(tenantAgent, { publicVerifierId: did })
      }
    } catch (error) {
      return {
        method,
        did,
        status: PreparedDidStatus.Failed,
        error: `OID4VC records: ${errorMessage(error)}`,
      }
    }
    return { method, did, status }
  }

  /**
   * Creates the requested schemas and registers them on the wallet's DIDs. An existing schema is not created again,
   * but its missing registrations are added, e.g. on a DID that the previous call could not create.
   */
  private async prepareSchemas(
    authInfo: AuthInfo,
    tenantAgent: TenantAgent,
    req: PrepareWalletRequestDto,
    dids: PreparedDidDto[],
    schemaLogo?: Express.Multer.File,
  ): Promise<void> {
    const logger = this.logger.child('prepareSchemas')
    const schemas = req.schemas ?? []
    logger.info(`Create ${schemas.length} schemas`)

    const didByNetwork = new Map(dids.filter(({ did }) => did).map(({ method, did }) => [method, did as string]))
    const owner = this.em.getReference(Wallet, authInfo.walletId)

    for (const schema of schemas) {
      let schemaId: string
      const existing = await this.em.findOne(Schema, { owner, name: { $eq: schema.name } })
      if (existing) {
        logger.info(`Schema "${schema.name}" already exists, adding missing registrations`)
        schemaId = existing.id
      } else {
        try {
          schemaId = (await this.schemaV2Service.create(authInfo, schema, schemaLogo)).id
        } catch (error) {
          logger.error(`Failed to create schema "${schema.name}": ${errorMessage(error)}`)
          continue
        }
      }

      for (const reg of schema.registrations ?? []) {
        const network: string = reg.network ?? PrepareWalletService.mainDidMethod
        const did = didByNetwork.get(network)
        if (!did) {
          logger.error(`No ${network} DID available to register schema "${schema.name}", skipping`)
          continue
        }
        try {
          await this.schemaV2Service.registration(authInfo, tenantAgent, schemaId, {
            ...reg,
            credentialFormat: credentialFormatToCredentialRegistrationFormat(reg.credentialFormat),
            did,
          })
        } catch (error) {
          logger.info(`Registration of schema "${schema.name}" on ${network} skipped: ${errorMessage(error)}`)
        }
      }
    }
  }
}
