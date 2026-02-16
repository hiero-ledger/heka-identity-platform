import { DbConfig } from '@core/config/configs/db.config'
import { ExpireInConfig } from '@core/config/configs/expire-in.config'
import { Type } from 'class-transformer'
import { ValidateNested, validateSync } from 'class-validator'

import { AppConfig, HealthConfig, JwtConfig, LoggerConfig } from './configs'

export class Config {
  @ValidateNested()
  @Type(() => AppConfig)
  public app!: AppConfig

  @ValidateNested()
  @Type(() => LoggerConfig)
  public logger!: LoggerConfig

  @ValidateNested()
  @Type(() => DbConfig)
  public db!: DbConfig

  @ValidateNested({ each: true })
  @Type(() => JwtConfig)
  public jwt!: JwtConfig

  @ValidateNested()
  @Type(() => ExpireInConfig)
  public expireIn!: ExpireInConfig

  @ValidateNested()
  @Type(() => HealthConfig)
  public health!: HealthConfig

  public constructor(configuration?: Record<string, any>) {
    this.app = new AppConfig(configuration)
    this.logger = new LoggerConfig(configuration)
    this.db = new DbConfig(configuration)
    this.jwt = new JwtConfig(configuration)
    this.expireIn = new ExpireInConfig(configuration)
    this.health = new HealthConfig(configuration)
  }
}

export function validate(configuration: Record<string, any>): Config {
  const config = new Config(configuration)

  const errors = validateSync(config, { skipMissingProperties: false })
  if (errors.length > 0) {
    throw new Error(`\n${errors.map((err) => err.toString(false, true, err.target?.constructor.name, true)).join('')}`)
  }

  return config
}
