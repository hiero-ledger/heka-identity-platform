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
}
