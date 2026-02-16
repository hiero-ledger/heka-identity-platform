import { IsArray, IsEnum, IsString } from 'class-validator'

export enum LoggerConfigKeys {
  level = 'LOG_LEVEL',
  excludeUrls = 'LOG_EXCLUDE_URLS',
  redactFields = 'LOG_REDACT_FIELDS',
}

export enum LogLevel {
  fatal = 'fatal',
  error = 'error',
  warn = 'warn',
  info = 'info',
  debug = 'debug',
  trace = 'trace',
}

const loggerConfigDefaults = {
  excludeUrls: [],
  redactFields: ['db.host', 'db.user', 'db.password', 'jwt.issuer', 'jwt.audience', 'jwt.secret'],
}

export class LoggerConfig {
  @IsEnum(LogLevel)
  public level: string

  @IsArray()
  @IsString({ each: true })
  public excludeUrls: string[]

  @IsArray()
  @IsString({ each: true })
  public redactFields: string[]

  public constructor(configuration?: Record<string, any>) {
    const env = configuration ?? process.env
    this.level = env[LoggerConfigKeys.level] || LogLevel.info
    this.excludeUrls = env[LoggerConfigKeys.excludeUrls]
      ? env[LoggerConfigKeys.excludeUrls].split(',')
      : loggerConfigDefaults.excludeUrls
    this.redactFields = env[LoggerConfigKeys.redactFields]
      ? env[LoggerConfigKeys.redactFields].split(',')
      : loggerConfigDefaults.redactFields
  }
}
