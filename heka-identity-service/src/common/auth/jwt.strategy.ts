import { Inject, Injectable } from '@nestjs/common'
import { ConfigType } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy, StrategyOptions } from 'passport-jwt'

import { InjectLogger, Logger } from 'common/logger'
import JwtConfig from 'config/jwt'

import { AuthInfo } from './auth-info.interface'
import { AuthService } from './auth.service'
import { TokenPayload } from './token-payload.interface'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  public constructor(
    @InjectLogger(JwtStrategy)
    private readonly logger: Logger,
    private readonly authService: AuthService,
    @Inject(JwtConfig.KEY)
    jwtConfig: ConfigType<typeof JwtConfig>,
  ) {
    const strategyOptions: StrategyOptions = {
      secretOrKey: jwtConfig.secret,
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      jsonWebTokenOptions: jwtConfig.verifyOptions,
    }

    const safeStrategyOptions = getSafeStrategyOptions(strategyOptions)

    super(safeStrategyOptions)

    this.logger.child('constructor').trace('<>')
  }

  // This method doesn't validate anything right now,
  // but in the future we can validate token revocation list here
  public async validate(tokenPayload: TokenPayload): Promise<AuthInfo> {
    const logger = this.logger.child('validate', { tokenPayload })
    logger.trace('>')

    const res = await this.authService.validateTokenPayload(tokenPayload)

    logger.trace({ res }, '<')
    return res
  }
}

// Workaround for issue https://github.com/mikenicholson/passport-jwt/issues/191
function getSafeStrategyOptions(strategyOptions: StrategyOptions): StrategyOptions {
  if (!strategyOptions.jsonWebTokenOptions) {
    return strategyOptions
  }

  return {
    ...strategyOptions,
    audience: (strategyOptions.jsonWebTokenOptions.audience ?? strategyOptions.audience) as string | undefined,
    issuer: strategyOptions.jsonWebTokenOptions.issuer ?? strategyOptions.issuer,
    algorithms: strategyOptions.jsonWebTokenOptions.algorithms ?? strategyOptions.algorithms,
    ignoreExpiration: strategyOptions.jsonWebTokenOptions.ignoreExpiration ?? strategyOptions.ignoreExpiration,
  }
}
