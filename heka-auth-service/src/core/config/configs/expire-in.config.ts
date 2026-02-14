import { IsInt, IsOptional, Min } from 'class-validator'

export enum ExpireInConfigKeys {
  passwordChange = 'EXPIRE_IN_PASSWORD_CHANGE',
}

const expireInConfigDefaults = {
  passwordChange: 60 * 60, // 1 hour
}

export class ExpireInConfig {
  @IsOptional()
  @IsInt()
  @Min(0)
  public passwordChange!: number

  public constructor(configuration?: Record<string, any>) {
    const env = configuration ?? process.env
    this.passwordChange = env[ExpireInConfigKeys.passwordChange]
      ? parseInt(env[ExpireInConfigKeys.passwordChange])
      : expireInConfigDefaults.passwordChange
  }
}
