import { EntityManager } from '@mikro-orm/core'
import { Injectable } from '@nestjs/common'

import { TenantAgent } from 'common/agent'
import { AuthInfo } from 'common/auth'
import { User } from 'common/entities'
import { InjectLogger, Logger } from 'common/logger'
import { OpenId4VcIssuerService } from 'openid4vc/issuer/issuer.service'

import { FileStorageService } from '../common/file-storage/file-storage.service'

import { PatchUserDto, UserDto } from './dto'

@Injectable()
export class UserService {
  private static LOGO_STORAGE_ROOT_PATH = 'users_logo'
  public constructor(
    private readonly em: EntityManager,
    @InjectLogger(UserService)
    private readonly logger: Logger,
    private readonly openId4VcIssuerService: OpenId4VcIssuerService,
    private readonly fileStorageService: FileStorageService,
  ) {
    this.logger.child('constructor').trace('<>')
  }

  public async getMe(authInfo: AuthInfo): Promise<UserDto> {
    const logger = this.logger.child('getMe', { authInfo })
    logger.trace('>')

    const user = await this.em.findOneOrFail(User, { id: authInfo.userId })
    logger.traceObject({ user })

    const res = this.userToUserDto(user)
    logger.trace({ res }, '<')
    return res
  }

  public async patchMe(
    authInfo: AuthInfo,
    tenantAgent: TenantAgent,
    req: PatchUserDto,
    logo?: Express.Multer.File,
  ): Promise<UserDto> {
    const logger = this.logger.child('patchMe', { req, authInfo })
    logger.trace('>')

    const user = await this.em.findOneOrFail(User, { id: authInfo.userId })
    logger.traceObject({ user })

    let newLogoPath = undefined

    if (logo) {
      newLogoPath = await this.setLogo(logo, user.logo)
    } else if (req.logo === '') {
      newLogoPath = req.logo // reset the logo
    }

    if (req.messageDeliveryType) {
      user.messageDeliveryType = req.messageDeliveryType
    }

    if (req.webHook) {
      user.webHook = req.webHook
    }

    if (newLogoPath) {
      user.logo = newLogoPath
    }

    if (req.backgroundColor) {
      user.backgroundColor = req.backgroundColor
    }

    if (req.name) {
      user.name = req.name
    }

    if (!user.registeredAt) {
      user.registeredAt = new Date()
    }

    const issuerLogoPath = newLogoPath ?? user.logo
    const issuerLogoUrl = issuerLogoPath ? this.fileStorageService.url(issuerLogoPath) : undefined
    await this.openId4VcIssuerService.applyUserDisplay(tenantAgent, {
      logo: {
        url: issuerLogoUrl,
      },
      background_color: user.backgroundColor,
      name: user.name ?? authInfo.userId,
    })
    await this.em.flush()

    const res = this.userToUserDto(user)
    logger.trace({ res }, '<')
    return res
  }

  /**
   * Returns new relative path if logo file provided, otherwise returns undefined.
   * If currentLogoPath provided - removes file by this path
   */
  private async setLogo(newLogoFile?: Express.Multer.File, currentLogoPath?: string): Promise<string | undefined> {
    if (!newLogoFile) {
      return undefined
    }
    if (currentLogoPath) {
      await this.fileStorageService.remove(currentLogoPath)
    }
    return this.fileStorageService.put(newLogoFile, {
      filePath: UserService.LOGO_STORAGE_ROOT_PATH,
      replace: true,
    })
  }

  private userToUserDto(user: User): UserDto {
    // make logo accessible from external world
    const logo = user.logo ? this.fileStorageService.url(user.logo) : undefined
    return new UserDto({ ...user, logo })
  }
}
