import { Body, Controller, Get, Patch, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'

import { ReqTenantAgent, TenantAgent, TenantAgentInterceptor } from 'common/agent'
import { AuthInfo, JwtAuthGuard, ReqAuthInfo } from 'common/auth'
import { InjectLogger, Logger } from 'common/logger'

import { imageMulterOptions } from '../common/file-uploader/image.multer.options'
import { ImageUploadingValidationPipe } from '../common/file-uploader/validation.pipe'

import { PatchUserDto, UserDto } from './dto'
import { UserService } from './user.service'

@ApiTags('User')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Unauthorized.' })
@ApiBadRequestResponse({ description: 'Bad Request.' })
@UseGuards(JwtAuthGuard)
@Controller('user')
@UseInterceptors(TenantAgentInterceptor)
export class UserController {
  public constructor(
    private readonly usersService: UserService,
    @InjectLogger(UserController)
    private readonly logger: Logger,
  ) {
    this.logger.child('constructor').trace('<>')
  }

  @ApiOperation({ summary: 'Get logged user data' })
  @ApiOkResponse({ description: 'Logged user data.', type: UserDto })
  @Get()
  public async getMe(@ReqAuthInfo() authInfo: AuthInfo): Promise<UserDto> {
    const logger = this.logger.child('getMe', { authInfo })
    logger.trace('>')

    const res = await this.usersService.getMe(authInfo)
    logger.traceObject({ res })

    logger.trace({ res }, '<')
    return res
  }

  @ApiOperation({ summary: 'Patch logged user data' })
  @ApiBody({ description: 'User data', type: PatchUserDto })
  @ApiOkResponse({ description: 'User data modified.', type: UserDto })
  @ApiConsumes('multipart/form-data')
  @Patch()
  @UseInterceptors(FileInterceptor('logo', imageMulterOptions))
  public async patchMe(
    @ReqAuthInfo() authInfo: AuthInfo,
    @Body() req: PatchUserDto,
    @ReqTenantAgent() tenantAgent: TenantAgent,
    @UploadedFile(ImageUploadingValidationPipe(false)) logo: Express.Multer.File,
  ): Promise<UserDto> {
    const logger = this.logger.child('patchMe', { req, authInfo, logo })
    logger.trace('>')

    const response = await this.usersService.patchMe(authInfo, tenantAgent, req, logo)

    logger.trace('<')

    return response
  }
}
