import { IsArray, IsBoolean, IsNumber, IsSemVer, IsString, Length, Max, Min } from 'class-validator'

export enum AppConfigKeys {
  name = 'APP_NAME',
  version = 'APP_VERSION',
  port = 'APP_PORT',
  prefix = 'APP_PREFIX',
  enableCors = 'APP_ENABLE_CORS',
  allowedOrigins = 'APP_ALLOW_ORIGINS',
}

const appConfigDefaults = {
  version: '0.0.1',
  name: 'Heka SSO Service',
  port: 3005,
  prefix: 'api',
  allowedOrigins: ['*'],
}

export class AppConfig {
  @IsString()
  @IsSemVer()
  public version: string

  @IsString()
  @Length(1, 255)
  public name: string

  @IsNumber()
  @Min(0)
  @Max(65535)
  public port: number

  @IsString()
  public prefix: string

  @IsBoolean()
  public enableCors: boolean

  @IsArray()
  @IsString({ each: true })
  public allowedOrigins: string[]

  public constructor(configuration?: Record<string, any>) {
    const env = configuration ?? process.env
    this.version = env[AppConfigKeys.version] || process.env.npm_package_version || appConfigDefaults.version
    this.name = env[AppConfigKeys.name] || appConfigDefaults.name
    this.port = env[AppConfigKeys.port] ? parseInt(env[AppConfigKeys.port]) : appConfigDefaults.port
    this.prefix = env[AppConfigKeys.prefix] || appConfigDefaults.prefix
    this.allowedOrigins = env[AppConfigKeys.allowedOrigins]
      ? env[AppConfigKeys.allowedOrigins].split(',')
      : appConfigDefaults.allowedOrigins
    this.enableCors = env[AppConfigKeys.enableCors]?.toLowerCase() === 'true'
  }
}
