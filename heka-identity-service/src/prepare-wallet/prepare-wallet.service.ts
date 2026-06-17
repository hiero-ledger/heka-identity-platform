import { ConflictException, Injectable } from '@nestjs/common'

import { EntityManager } from '@mikro-orm/core'

import { TenantAgent } from 'common/agent'
import { AuthInfo } from 'common/auth'
import { Wallet } from 'common/entities'
import { InjectLogger, Logger } from 'common/logger'
import { credentialFormatToCredentialRegistrationFormat, DidMethod } from 'common/types'
import { DidService } from 'did/did.service'
import { OpenId4VcIssuerService } from 'openid4vc/issuer/issuer.service'
import { OpenId4VcVerifierService } from 'openid4vc/verifier/verifier.service'
import { PrepareWalletRequestDto, PrepareWalletResponseDto } from 'prepare-wallet/dto/prepare-wallet.dto'
import { SchemaV2Service } from 'schema-v2/schema-v2.service'
import { UserService } from 'user/user.service'

@Injectable()
export class PrepareWalletService {
  private static mainDidMethod = DidMethod.Key
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
  ) {}

  public async prepareWallet(
    authInfo: AuthInfo,
    tenantAgent: TenantAgent,
    req: PrepareWalletRequestDto,
    schemaLogo?: Express.Multer.File,
    userLogo?: Express.Multer.File,
  ): Promise<PrepareWalletResponseDto> {
    const logger = this.logger.child('prepareWallet', { req })
    logger.trace('>')

    const didDocuments = await this.didService.find(tenantAgent, {
      method: PrepareWalletService.mainDidMethod as string,
      own: true,
    })

    let mainDid: string | undefined

    if (didDocuments.length > 0) {
      logger.info(`Wallet for user ${authInfo.userName} already prepared`)
      mainDid = didDocuments[0].id
    } else {
      // Sort methods to ensure the main method runs first and claims the single publicDid slot
      const sortedMethods = [...this.didService.getMethods().methods].sort((a, b) => {
        if (a === PrepareWalletService.mainDidMethod) return -1
        if (b === PrepareWalletService.mainDidMethod) return 1
        return 0
      })

      for (const method of sortedMethods) {
        let did

        try {
          const didDoc = await this.didService.create(authInfo, { method })
          did = didDoc.id
          if (method === PrepareWalletService.mainDidMethod) {
            mainDid = did
          }
        } catch (error) {
          if (error instanceof ConflictException) {
            // wallet.publicDid was already claimed by a previously iterated DID method
            // (e.g. 'indy' runs before 'key' in the default method order).
            // The wallet is correctly initialised — reuse the persisted publicDid.
            if (!mainDid) {
              const wallet = await this.em.findOne(Wallet, { id: authInfo.walletId })
              if (wallet?.publicDid) {
                logger.info(
                  `wallet.publicDid already set to ${wallet.publicDid}; reusing it as mainDid (method=${method} was skipped)`,
                )
                mainDid = wallet.publicDid
              }
            }
          } else {
            logger.error(`Failed to create DID for method ${method}: ${(error as Error).message}`)
          }
          continue
        }

        try {
          await this.openId4VcIssuerService.createIssuer(tenantAgent, {
            publicIssuerId: did,
            credentialsSupported: [],
          })
          await this.openId4VcVerifierService.createVerifier(tenantAgent, { publicVerifierId: did })
        } catch (error) {
          logger.error(`Failed to initialize OID4VC records for DID ${did}`)
        }
      }

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

    if (!mainDid) {
      throw new Error(`Failed to create DID for main method ${PrepareWalletService.mainDidMethod}`)
    }

    if (req.schemas) {
      logger.info(`Create ${req.schemas.length} schemas`)

      for (const schema of req.schemas) {
        let schemaId: string
        try {
          const created = await this.schemaV2Service.create(authInfo, schema, schemaLogo)
          schemaId = created.id
        } catch (error) {
          logger.info(`Schema "${schema.name}" already exists, skipping creation`)
          continue
        }
        if (schema.registrations) {
          logger.info(`Register ${schema.registrations.length} types for schema ${schema.name}`)
          for (const reg of schema.registrations) {
            try {
              await this.schemaV2Service.registration(authInfo, tenantAgent, schemaId, {
                ...reg,
                credentialFormat: credentialFormatToCredentialRegistrationFormat(reg.credentialFormat),
                did: mainDid,
              })
            } catch (error) {
              logger.info(`Registration for schema "${schema.name}" already exists, skipping`)
            }
          }
        }
      }
    }

    logger.info(`Prepared wallet with main method DID: ${mainDid}`)
    logger.trace('<')
    return new PrepareWalletResponseDto({ did: mainDid })
  }
}
