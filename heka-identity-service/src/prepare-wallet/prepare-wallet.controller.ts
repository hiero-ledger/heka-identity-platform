import { Body, Controller, Post, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common'
import { FileFieldsInterceptor } from '@nestjs/platform-express/multer/interceptors/file-fields.interceptor'
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'

import { ReqTenantAgent, TenantAgent, TenantAgentInterceptor } from 'common/agent'
import { AuthInfo, JwtAuthGuard, ReqAuthInfo } from 'common/auth'
import { AnyRole, RoleGuard } from 'common/authz'
import { imageMulterOptions } from 'common/file-uploader/image.multer.options'
import { ImagesUploadingValidationPipe } from 'common/file-uploader/validation.pipe'
import { InjectLogger, Logger } from 'common/logger'
import { PrepareWalletRequestDto, PrepareWalletResponseDto } from 'prepare-wallet/dto/prepare-wallet.dto'
import { PrepareWalletService } from 'prepare-wallet/prepare-wallet.service'

@ApiTags('Prepare Wallet')
@ApiBearerAuth()
@Controller({ path: 'prepare-wallet' })
@UseGuards(JwtAuthGuard, RoleGuard)
@UseInterceptors(TenantAgentInterceptor)
@ApiBadRequestResponse({ description: 'Bad Request' })
@ApiUnauthorizedResponse({ description: 'Unauthorized' })
export class PrepareWalletController {
  public constructor(
    private readonly prepareWalletService: PrepareWalletService,
    @InjectLogger(PrepareWalletController)
    private readonly logger: Logger,
  ) {}

  @ApiOperation({
    summary: "Prepare User's Wallet",
    description:
      'Creates a DID of every enabled method with its OID4VC issuer and verifier, the profile and the requested schemas. ' +
      'Calls for one wallet run one at a time across instances; a repeated call creates whatever is still missing. ' +
      '`dids` reports each method.',
  })
  @ApiServiceUnavailableResponse({ description: 'Another call has been preparing the wallet for too long; retry' })
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'schemaLogo', maxCount: 1 },
        { name: 'userLogo', maxCount: 1 },
      ],
      imageMulterOptions,
    ),
  )
  @ApiConsumes('multipart/form-data')
  @AnyRole()
  @Post('')
  public async prepareWallet(
    @ReqAuthInfo() authInfo: AuthInfo,
    @ReqTenantAgent() tenantAgent: TenantAgent,
    @Body() request: PrepareWalletRequestDto,
    @UploadedFiles(ImagesUploadingValidationPipe(false))
    files: { schemaLogo?: Express.Multer.File[]; userLogo?: Express.Multer.File[] },
  ): Promise<PrepareWalletResponseDto> {
    const logger = this.logger.child('prepareWallet', { authInfo })
    logger.trace('>')
    const res = await this.prepareWalletService.prepareWallet(
      authInfo,
      tenantAgent,
      request,
      files?.schemaLogo ? files.schemaLogo[0] : undefined,
      files?.userLogo ? files.userLogo[0] : undefined,
    )
    logger.trace({ res }, '<')
    return res
  }
}
