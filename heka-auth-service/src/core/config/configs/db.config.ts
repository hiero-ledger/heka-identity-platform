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
  port: 5432,
  name: 'postgres',
  user: 'postgres',
  password: 'postgres',
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
    this.user = env[OrmConfigKeys.user] || dbConfigDefaults.user
    this.password = env[OrmConfigKeys.password] || dbConfigDefaults.password
  }
}
