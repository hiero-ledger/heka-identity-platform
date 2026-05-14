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
  accessExpiry: 60 * 60, // 1h
  refreshExpiry: 86400, // 24h
  demoUserTokenExpiry: 60 * 60 * 24 * 365, // ~1 year validity for Demo User
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

    const secret = env[JwtConfigKeys.secret] as string | undefined
    if (!secret || secret.length < 32) {
      throw new Error(
        '[heka-auth-service] JWT_SECRET env var must be set to a random string of at least 32 characters. ' +
          "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
      )
    }

    this.issuer = env[JwtConfigKeys.issuer] || jwtConfigDefaults.issuer
    this.audience = env[JwtConfigKeys.audience] || jwtConfigDefaults.audience
    this.secret = secret

    this.accessExpiry = env[JwtConfigKeys.accessExpiry]
      ? parseInt(env[JwtConfigKeys.accessExpiry])
      : jwtConfigDefaults.accessExpiry
    this.refreshExpiry = env[JwtConfigKeys.refreshExpiry]
      ? parseInt(env[JwtConfigKeys.refreshExpiry])
      : jwtConfigDefaults.refreshExpiry

    this.demoUser = env[JwtConfigKeys.demoUser]
  }
}
