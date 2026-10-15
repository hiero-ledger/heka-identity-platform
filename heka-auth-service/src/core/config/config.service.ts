import { Config } from '@config'
import { Injectable } from '@nestjs/common'
import { ConfigService as NestConfigService, registerAs } from '@nestjs/config'

const configToken = 'config'
export const configFactory = registerAs(configToken, () => new Config())

@Injectable()
export class ConfigService {
  private readonly _conf: Config

  public constructor(private readonly configService: NestConfigService) {
    this._conf = this.configService.getOrThrow<Config>(configToken)
  }

  public get config() {
    return this._conf
  }

  public get appConfig() {
    return this.config.app
  }

  public get loggerConfig() {
    return this.config.logger
  }

  public get dbConfig() {
    return this.config.db
  }

  public get jwtConfig() {
    return this.config.jwt
  }

  public get expireInConfig() {
    return this.config.expireIn
  }

  public get healthConfig() {
    return this.config.health
  }

  public get throttleConfig() {
    return this.config.throttle
  }

  public get githubConfig() {
    return this.config.github
  }

  /**
   * Shared secret for service-to-service authentication.
   * Read by InternalAuthGuard on the auth-service internal binding endpoint.
   * Must match INTERNAL_SERVICE_SECRET in identity-service.
   *
   * Never expose this value to the browser or web UI.
   */
  public get internalServiceSecret(): string {
    return process.env['INTERNAL_SERVICE_SECRET'] ?? ''
  }

  /**
   * Secret for signing short-lived contributor credential-offer JWTs.
   * Issued by auth-service gpg-challenge/verify, validated by identity-service ContributorJwtGuard.
   */
  public get contributorJwtSecret(): string {
    return process.env['CONTRIBUTOR_JWT_SECRET'] ?? this.config.jwt.secret
  }
}
