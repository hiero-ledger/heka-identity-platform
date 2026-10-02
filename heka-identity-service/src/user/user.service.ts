import { EntityManager } from '@mikro-orm/core'
import { BadRequestException, Injectable } from '@nestjs/common'

import { TenantAgent } from 'common/agent'
import { AuthInfo } from 'common/auth'
import { User, Wallet } from 'common/entities'
import { InjectLogger, Logger } from 'common/logger'
import { WebhookEgressService, WebhookTargetPolicyError } from 'common/webhook'
import { OpenId4VcIssuerService } from 'openid4vc/issuer/issuer.service'
import { administersWallet } from 'utils/auth'

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
    private readonly webhookEgress: WebhookEgressService,
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

    // Validate before any side effect: replacing the logo deletes the old file irreversibly.
    if (req.webHook) {
      await this.assertWebhookAllowed(req.webHook)
    }

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

    // The issuer display belongs to the wallet, so only an actor who administers it writes it, and only when the
    // request changes a display field (a shared wallet's branding must not follow unrelated profile updates)
    const changesDisplay = Boolean(req.name || req.backgroundColor || logo || req.logo === '')
    if (changesDisplay && administersWallet(authInfo.role)) {
      const issuerLogoPath = newLogoPath ?? user.logo
      const issuerLogoUrl = issuerLogoPath ? this.fileStorageService.publicUrl(issuerLogoPath) : undefined
      const displayName = user.name ?? authInfo.userId
      await this.openId4VcIssuerService.applyUserDisplay(tenantAgent, {
        logo: {
          uri: issuerLogoUrl,
        },
        background_color: user.backgroundColor,
        name: displayName,
      })

      const wallet = await this.em.findOneOrFail(Wallet, { id: authInfo.walletId })
      wallet.displayName = displayName
    }
    await this.em.flush()

    const res = this.userToUserDto(user)
    logger.trace({ res }, '<')
    return res
  }

  private async assertWebhookAllowed(webHook: string): Promise<void> {
    try {
      await this.webhookEgress.assertCallbackUrlAllowed(webHook)
    } catch (error: unknown) {
      if (error instanceof WebhookTargetPolicyError) {
        throw new BadRequestException(error.message)
      }
      throw error
    }
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
