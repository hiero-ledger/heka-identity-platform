import { Injectable } from '@nestjs/common'

import { TenantAgent } from 'common/agent'
import { AuthInfo } from 'common/auth'
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
    if (didDocuments.length > 0) {
      logger.info(`Wallet for user ${authInfo.userName} already prepared`)
      return new PrepareWalletResponseDto({ did: didDocuments[0].id })
    }

    let mainDid
    for (const method of this.didService.getMethods().methods) {
      let did

      try {
        const didDoc = await this.didService.create(authInfo, { method })
        did = didDoc.id
        if (method === PrepareWalletService.mainDidMethod) {
          mainDid = did
        }
      } catch (error) {
        this.logger.error(`Failed to create DID for method ${method}`)
        continue
      }

      try {
        await this.openId4VcIssuerService.createIssuer(tenantAgent, {
          publicIssuerId: did,
          credentialsSupported: [],
        })
        await this.openId4VcVerifierService.createVerifier(tenantAgent, { publicVerifierId: did })
      } catch (error) {
        this.logger.error(`Failed to initialize OID4VC records for DID ${did}`)
      }
    }

    if (!mainDid) {
      throw new Error(`Failed to create DID for main method ${PrepareWalletService.mainDidMethod}`)
    }

    if (req.schemas) {
      logger.info(`Create ${req.schemas.length} schemas`)

      for (const schema of req.schemas) {
        const { id: schemaId } = await this.schemaV2Service.create(authInfo, schema, schemaLogo)
        if (schema.registrations) {
          logger.info(`Register ${schema.registrations.length} types for schema ${schema.name}`)
          for (const reg of schema.registrations) {
            await this.schemaV2Service.registration(authInfo, tenantAgent, schemaId, {
              ...reg,
              credentialFormat: credentialFormatToCredentialRegistrationFormat(reg.credentialFormat),
              did: mainDid,
            })
          }
        }
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
    logger.info(`Prepared wallet with main method DID: ${mainDid}`)
    logger.trace('<')
    return new PrepareWalletResponseDto({ did: mainDid })
  }
}
