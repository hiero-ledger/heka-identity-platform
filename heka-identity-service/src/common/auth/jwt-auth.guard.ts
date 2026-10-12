import { IncomingMessage } from 'http'

import { CanActivate, ExecutionContext, HttpException, Injectable } from '@nestjs/common'

import { InjectLogger, Logger } from 'common/logger'

import { AuthInfo } from './auth-info.interface'
import { AuthService } from './auth.service'

type AuthenticatedRequest = IncomingMessage & { user?: AuthInfo }

/**
 * Authenticates HTTP requests by their bearer token and exposes the resulting
 * `AuthInfo` as `request.user` (read by `RoleGuard` and `@ReqAuthInfo()`).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  public constructor(
    private readonly authService: AuthService,
    @InjectLogger(JwtAuthGuard)
    private readonly logger: Logger,
  ) {
    this.logger.child('constructor').trace('<>')
  }

  public async canActivate(executionContext: ExecutionContext): Promise<boolean> {
    const logger = this.logger.child('canActivate')
    logger.trace('>')

    const request = executionContext.switchToHttp().getRequest<AuthenticatedRequest>()

    try {
      request.user = await this.authService.validateRequestToken(request)
    } catch (error) {
      if (error instanceof HttpException) {
        logger.warn({ err: error }, '! unauthorized')
      } else {
        logger.error({ err: error }, '! token validation error')
      }
      throw error
    }

    logger.trace('<')
    return true
  }
}
