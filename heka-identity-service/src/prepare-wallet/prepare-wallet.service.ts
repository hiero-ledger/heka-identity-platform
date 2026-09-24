import { EntityManager } from '@mikro-orm/core'
import { Injectable } from '@nestjs/common'

import { TenantAgent } from 'common/agent'
import { AuthInfo } from 'common/auth'
import { AuthorizationService, Capability } from 'common/authz'
import { Wallet } from 'common/entities'
import { InjectLogger, Logger } from 'common/logger'
import { credentialFormatToCredentialRegistrationFormat, DidMethod, MAIN_DID_METHOD } from 'common/types'
import { DidService } from 'did/did.service'
import { OpenId4VcIssuerService } from 'openid4vc/issuer/issuer.service'
import { OpenId4VcVerifierService } from 'openid4vc/verifier/verifier.service'
import { PrepareWalletRequestDto, PrepareWalletResponseDto } from 'prepare-wallet/dto/prepare-wallet.dto'
import { SchemaV2Service } from 'schema-v2/schema-v2.service'
import { UserService } from 'user/user.service'

@Injectable()
export class PrepareWalletService {
  private static mainDidMethod = MAIN_DID_METHOD
  private static defaultColor = '#f58529'

  public constructor(
    @InjectLogger(PrepareWalletService)
    private readonly logger: Logger,
    private readonly em: EntityManager,
    private readonly authorizationService: AuthorizationService,
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

    // Creating and registering schemas is an `issue` operation, so it is authorized before anything is created
    if (req.schemas?.length) {
      this.authorizationService.assert(authInfo, Capability.Issue)
    }

    const wallet = await this.em.findOneOrFail(Wallet, { id: authInfo.walletId })
    let mainDid: string | undefined = wallet.publicDid

    if (mainDid) {
      logger.info(`Wallet ${authInfo.walletId} already prepared`)
    } else {
      for (const method of this.didService.getMethods().methods) {
        let did

        try {
          const didDoc = await this.didService.create(authInfo, { method })
          did = didDoc.id
          if (method === PrepareWalletService.mainDidMethod) {
            mainDid = did
          }
        } catch (error) {
          // The main DID is required, so the reason it failed (e.g. 403 or 422) is returned as is
          if (method === PrepareWalletService.mainDidMethod) {
            throw error
          }
          this.logger.error(`Failed to create DID for method ${method}`)
          continue
        }

        // OID4VC records are `issue` / `verify` operations, created only for capabilities the actor holds
        try {
          if (this.authorizationService.can(authInfo.role, Capability.Issue)) {
            await this.openId4VcIssuerService.createIssuer(tenantAgent, {
              publicIssuerId: did,
              credentialsSupported: [],
            })
          }
          if (this.authorizationService.can(authInfo.role, Capability.Verify)) {
            await this.openId4VcVerifierService.createVerifier(tenantAgent, { publicVerifierId: did })
          }
        } catch (error) {
          this.logger.error(`Failed to initialize OID4VC records for DID ${did}`)
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

      const didByNetwork = new Map<DidMethod, string>([[PrepareWalletService.mainDidMethod, mainDid]])

      const resolveDidForNetwork = async (network: DidMethod): Promise<string | undefined> => {
        const cached = didByNetwork.get(network)
        if (cached) return cached
        try {
          const [didDoc] = await this.didService.find(tenantAgent, { method: network, own: true })
          if (didDoc) didByNetwork.set(network, didDoc.id)
          return didDoc?.id
        } catch (error) {
          logger.error(`Failed to resolve ${network} DID`)
          return undefined
        }
      }

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
            const network = reg.network ?? PrepareWalletService.mainDidMethod
            const did = await resolveDidForNetwork(network)
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
