import { Body, Controller, Post, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common'
import { FileFieldsInterceptor } from '@nestjs/platform-express/multer/interceptors/file-fields.interceptor'
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'

import { ReqTenantAgent, TenantAgent, TenantAgentInterceptor } from 'common/agent'
import { AuthInfo, JwtAuthGuard, ReqAuthInfo } from 'common/auth'
import { RoleGuard } from 'common/authz'
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

  @ApiOperation({ summary: "Prepare User's Wallet" })
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
