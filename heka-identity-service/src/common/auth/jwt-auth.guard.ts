import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'

import { InjectLogger, Logger } from 'common/logger'

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  public constructor(
    @InjectLogger(JwtAuthGuard)
    private readonly logger: Logger,
  ) {
    super()
    this.logger.child('constructor').trace('<>')
  }

  public canActivate(executionContext: ExecutionContext) {
    const logger = this.logger.child('canActivate')
    logger.trace('>')

    const res = super.canActivate(executionContext)
    logger.trace('<')
    return res
  }

  public handleRequest(err: any, user: any, info: any) {
    const logger = this.logger.child('handleRequest', { err, user, info })
    logger.trace('>')

    if (err) {
      logger.warn({ err }, '! error')
      throw err
    }

    if (!user) {
      const e = new UnauthorizedException()
      logger.warn({ err: e }, '! unauthorized')
      throw e
    }

    const res = user
    logger.trace({ res }, '<')
    return res
  }
}
