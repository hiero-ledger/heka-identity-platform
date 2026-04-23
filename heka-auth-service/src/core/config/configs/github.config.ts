import { IsBoolean, IsString } from 'class-validator'

export enum GitHubConfigKeys {
  clientId = 'GITHUB_CLIENT_ID',
  clientSecret = 'GITHUB_CLIENT_SECRET',
  callbackUrl = 'GITHUB_CALLBACK_URL',
  enabled = 'GITHUB_OAUTH_ENABLED',
}

const githubConfigDefaults = {
  callbackUrl: 'http://localhost:3004/api/v1/oauth/github/callback',
  enabled: false,
}

export class GitHubConfig {
  @IsString()
  public clientId: string

  @IsString()
  public clientSecret: string

  @IsString()
  public callbackUrl: string

  @IsBoolean()
  public enabled: boolean

  public constructor(configuration?: Record<string, any>) {
    const env = configuration ?? process.env
    this.clientId = env[GitHubConfigKeys.clientId] || ''
    this.clientSecret = env[GitHubConfigKeys.clientSecret] || ''
    this.callbackUrl = env[GitHubConfigKeys.callbackUrl] || githubConfigDefaults.callbackUrl
    this.enabled = env[GitHubConfigKeys.enabled]?.toLowerCase() === 'true'
  }
}
