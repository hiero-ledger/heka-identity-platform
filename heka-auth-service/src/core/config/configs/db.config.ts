import { IsNumber, IsString, Max, Min } from 'class-validator'

export enum OrmConfigKeys {
  host = 'DB_HOST',
  port = 'DB_PORT',
  dbName = 'DB_NAME',
  user = 'DB_USER',
  password = 'DB_PASSWORD',
}

const dbConfigDefaults = {
  host: 'localhost',
  port: 5433,
  name: 'heka-auth-service',
}

export class DbConfig {
  @IsString()
  public host: string

  @IsNumber()
  @Min(0)
  @Max(65535)
  public port: number

  @IsString()
  public name: string

  @IsString()
  public user: string

  @IsString()
  public password: string

  public constructor(configuration?: Record<string, any>) {
    const env = configuration ?? process.env
    ;(this.host = env[OrmConfigKeys.host] || dbConfigDefaults.host),
      (this.port = env[OrmConfigKeys.port] ? parseInt(env[OrmConfigKeys.port]) : dbConfigDefaults.port)
    this.name = env[OrmConfigKeys.dbName] || dbConfigDefaults.name
    const user = env[OrmConfigKeys.user]
    const password = env[OrmConfigKeys.password]
    if (!user) {
      throw new Error(`Required environment variable ${OrmConfigKeys.user} is not set`)
    }
    if (!password) {
      throw new Error(`Required environment variable ${OrmConfigKeys.password} is not set`)
    }
    this.user = user
    this.password = password
  }
}
