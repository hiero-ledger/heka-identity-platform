import { IsInt, Min } from 'class-validator'

export enum ThrottleConfigKeys {
  ttl = 'THROTTLE_TTL',
  limit = 'THROTTLE_LIMIT',
}

const throttleConfigDefaults = {
  ttl: 60000,
  limit: 100,
}

export class ThrottleConfig {
  @IsInt()
  @Min(0)
  public ttl!: number

  @IsInt()
  @Min(1)
  public limit!: number

  public constructor(configuration?: Record<string, any>) {
    const env = configuration ?? process.env
    this.ttl = env[ThrottleConfigKeys.ttl] ? parseInt(env[ThrottleConfigKeys.ttl]) : throttleConfigDefaults.ttl
    this.limit = env[ThrottleConfigKeys.limit] ? parseInt(env[ThrottleConfigKeys.limit]) : throttleConfigDefaults.limit
  }
}
