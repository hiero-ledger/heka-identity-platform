import { IsInt, IsString, Min } from 'class-validator'

export enum JwtConfigKeys {
  issuer = 'JWT_ISSUER',
  audience = 'JWT_AUDIENCE',
  secret = 'JWT_SECRET',
  accessExpiry = 'JWT_ACCESS_EXPIRY',
  refreshExpiry = 'JWT_REFRESH_EXPIRY',
  demoUser = 'DEMO_USER',
}

export const jwtConfigDefaults = {
  issuer: 'Heka',
  audience: 'Heka Identity Service',
  secret: 'test',
  accessExpiry: 60 * 60, // 1h
  refreshExpiry: 86400, // 24h
  demoUserTokenExpiry: 1000 * 24 * 60 * 60 * 30 * 12, // ~1 years validity for Demo User
}

export class JwtConfig {
  @IsString()
  public issuer!: string

  @IsString()
  public audience!: string

  @IsString()
  public secret!: string

  @IsInt()
  @Min(0)
  public accessExpiry!: number

  @IsInt()
  @Min(0)
  public refreshExpiry!: number

  @IsString()
  public demoUser: string

  public constructor(configuration?: Record<string, any>) {
    const env = configuration ?? process.env
    this.issuer = env[JwtConfigKeys.issuer] || jwtConfigDefaults.issuer
    this.audience = env[JwtConfigKeys.audience] || jwtConfigDefaults.audience
    this.secret = env[JwtConfigKeys.secret] || jwtConfigDefaults.secret

    this.accessExpiry = env[JwtConfigKeys.accessExpiry]
      ? parseInt(env[JwtConfigKeys.accessExpiry])
      : jwtConfigDefaults.accessExpiry
    this.refreshExpiry = env[JwtConfigKeys.refreshExpiry]
      ? parseInt(env[JwtConfigKeys.refreshExpiry])
      : jwtConfigDefaults.refreshExpiry

    this.demoUser = env[JwtConfigKeys.demoUser]
  }
}
