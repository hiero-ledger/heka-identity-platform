import type { Request } from 'express'

import { Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigType } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy, StrategyOptions } from 'passport-jwt'

import { InjectLogger, Logger } from 'common/logger'
import JwtConfig from 'config/jwt'

import { AuthInfo } from './auth-info.interface'
import { AuthService } from './auth.service'
import { TokenPayload } from './token-payload.interface'
import { TokenRevocationService } from './token-revocation.service'

const extractToken = ExtractJwt.fromAuthHeaderAsBearerToken()

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  public constructor(
    @InjectLogger(JwtStrategy)
    private readonly logger: Logger,
    private readonly authService: AuthService,
    private readonly tokenRevocation: TokenRevocationService,
    @Inject(JwtConfig.KEY)
    jwtConfig: ConfigType<typeof JwtConfig>,
  ) {
    const strategyOptions: StrategyOptions = {
      // JwtConfig always resolves `secret` to a string (env var or fallback).
      // passport-jwt expects `string | Buffer`, while `jwt.Secret` also includes KeyObject.
      // Narrowing to `string` is safe and avoids TS2322.
      secretOrKey: jwtConfig.secret as string,
      jwtFromRequest: extractToken,
      jsonWebTokenOptions: jwtConfig.verifyOptions,
      // The raw token is needed for the revocation check in `validate`
      passReqToCallback: true,
    }

    const safeStrategyOptions = getSafeStrategyOptions(strategyOptions)

    super(safeStrategyOptions)

    this.logger.child('constructor').trace('<>')
  }

  // Called by passport-jwt after the signature, `iss`, `aud` and `exp` have been verified
  public async validate(request: Request, tokenPayload: TokenPayload): Promise<AuthInfo> {
    const logger = this.logger.child('validate', { tokenPayload })
    logger.trace('>')

    // Same extractor passport-jwt used to obtain the verified token
    const token = extractToken(request)
    if (!token) {
      throw new UnauthorizedException()
    }

    // Before validateTokenPayload, so a revoked token never provisions a user or wallet
    await this.tokenRevocation.assertTokenActive(token)

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
